import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.VIBO_BASE_URL || 'https://wwwvibo.com';
const API_KEY = process.env.VIBO_API_KEY || '';

async function callApi(endpoint: string, payload?: Record<string, unknown>, method = 'POST') {
  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'ViBoMCP/0.2',
  };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const opts: RequestInit = { method, headers };
  if (payload) opts.body = JSON.stringify({ key: API_KEY, ...payload });
  try {
    const resp = await fetch(url, opts);
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('application/json') ? await resp.json() : { ok: false, message: `Non-JSON response (${resp.status})` };
  } catch (e: any) {
    return { ok: false, message: `Network error: ${e?.message || e}` };
  }
}

const server = new McpServer({
  name: 'vibo-memory',
  version: '0.2.1',
});

// ---- memory/search ----
server.tool(
  'memory_search',
  'Search persistent memory for relevant facts. Returns facts + token savings.',
  { query: z.string().max(500).describe('What to search for'), limit: z.number().min(1).max(20).optional().default(5) },
  async ({ query, limit }) => {
    const res = await callApi('/memory/search', { query, limit });
    if (!res.ok) return { content: [{ type: 'text', text: `Error: ${res.message || 'unknown'}` }] };
    if (!res.facts?.length) return { content: [{ type: 'text', text: 'No facts found. Add some with memory_add.' }] };
    const lines = res.facts.map((f: any) => `• [${f.level}] ${f.label}: ${f.content}`);
    lines.push(`\n💾 Saved ${res.saved_tokens} tokens (${res.saved_pct}%)`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ---- web_search (temporarily disabled — the local compressor ships in a later release) ----
server.tool(
  'web_search',
  'Fetch a web page and compress it through ViBo (saves 96-99% tokens).',
  { url: z.string().max(2048).describe('URL to fetch'), query: z.string().max(500).optional().describe('What you are looking for') },
  async ({ url, query }) => ({
    content: [{ type: 'text', text: 'web_search is disabled in this build — it ships in the next release. Use your own fetch for now.' }],
  }),
);

// ---- memory/add ----
server.tool(
  'memory_add',
  'Save a fact to persistent memory. Deduplicated by exact match.',
  { label: z.string().max(200).describe('Short name of the fact'), content: z.string().max(5000).describe('The fact to remember') },
  async ({ label, content }) => {
    const res = await callApi('/memory/add', { label, content });
    if (!res.ok) return { content: [{ type: 'text', text: `Error: ${res.message || 'unknown'}` }] };
    const msg = res.added ? `✅ Saved "${label}" (${res.nodes} facts total)` : 'ℹ️ Duplicate — already in memory';
    return { content: [{ type: 'text', text: msg }] };
  },
);

// ---- memory/usage ----
server.tool(
  'memory_usage',
  'Get token savings statistics (today + all-time).',
  {},
  async () => {
    if (!API_KEY) {
      return { content: [{ type: 'text', text: 'No VIBO_API_KEY set. Get a free key (500 facts forever): https://wwwvibo.com/download/trial' }] };
    }
    const res = await callApi('/usage', undefined, 'GET');
    if (!res.ok) return { content: [{ type: 'text', text: `Error: ${res.message || 'unknown'}` }] };
    return {
      content: [{
        type: 'text',
        text: `📊 ViBo savings\nToday: ${res.today_tokens || 0} tokens\nAll-time: ${res.saved_tokens?.toLocaleString() || 0} tokens\nTotal: $${res.saved_usd || 0}`,
      }],
    };
  },
);

// ---- thread ----
server.tool(
  'thread_memory',
  'Thread memory: add message, compress old ones, ask details, get context.',
  {
    action: z.enum(['add', 'compress', 'ask', 'context']),
    text: z.string().optional(),
    role: z.enum(['user', 'assistant']).optional().default('user'),
    topic: z.string().optional(),
  },
  async ({ action, text, role, topic }) => {
    const res = await callApi('/memory/thread', { action, text, role, topic });
    if (!res.ok) return { content: [{ type: 'text', text: `Error: ${res.message || 'unknown'}` }] };
    if (action === 'compress') {
      return { content: [{ type: 'text', text: `📦 Compressed ${res.compressed} messages: ${res.orig_tokens} → ${res.summary_tokens} tokens (-${res.saved_pct}%)` }] };
    }
    if (action === 'ask') {
      if (!res.results?.length) return { content: [{ type: 'text', text: 'Nothing found in thread history.' }] };
      return { content: [{ type: 'text', text: res.results.map((r: any) => `• ${r.content}`).join('\n') }] };
    }
    if (action === 'context') {
      return { content: [{ type: 'text', text: res.context || 'Empty — add messages first.' }] };
    }
    return { content: [{ type: 'text', text: `✅ Message added (${res.nodes} in thread)` }] };
  },
);

// ---- listen ----
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('🦞 ViBo MCP server running (memory for AI agents)');
