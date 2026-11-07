import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  addFact,
  dbPath,
  estimateTokens,
  forgetFact,
  load,
  save,
  verifyChain,
  type Db,
  type Level,
} from './store.js';
import { search, verify } from './search.js';

const VERSION = '0.3.0';
const API_KEY = process.env.VIBO_API_KEY || '';
const BASE_URL = process.env.VIBO_BASE_URL || '';

const server = new McpServer({ name: 'vibo-memory', version: VERSION });

function ok(text: string, structured: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text }], structuredContent: structured };
}

function fail(text: string, structured: Record<string, unknown> = { ok: false }) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: structured,
    isError: true,
  };
}

// Optional cloud mirror. Local memory is always the source of truth:
// a missing or unreachable backend must never break a tool call.
async function mirror(path: string, payload: Record<string, unknown>): Promise<void> {
  if (!API_KEY || !BASE_URL) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ key: API_KEY, ...payload }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    // Offline-first by design: the call already succeeded locally.
  }
}

server.tool(
  'memory_add',
  'Save a durable fact to local memory on this machine. Deduplicated by label+content.',
  {
    label: z.string().min(1).max(200).describe('Short stable name, e.g. "client-anna-prefs"'),
    content: z.string().min(1).max(5000).describe('One self-contained statement'),
    level: z
      .enum(['L1', 'L2', 'L3'])
      .optional()
      .default('L1')
      .describe('L1 normal, L2 sensitive, L3 secret (hidden from search unless asked)'),
  },
  async ({ label, content, level }) => {
    const db = load();
    const res = addFact(db, label, content, level as Level, 'agent');
    save(db);
    void mirror('/memory/add', { label, content, level });
    const text = res.added
      ? `Saved "${label}" (${db.facts.length} facts)`
      : `Duplicate — "${label}" already stored, timestamp refreshed`;
    return ok(text, {
      ok: true,
      added: res.added,
      total: db.facts.length,
      id: res.fact?.id ?? null,
      file: dbPath(),
    });
  },
);

server.tool(
  'memory_search',
  'Search local memory for relevant facts. Use before asking the user to repeat something.',
  {
    query: z.string().min(1).max(500).describe('What to search for'),
    limit: z.number().min(1).max(20).optional().default(5),
    include_secrets: z.boolean().optional().default(false).describe('Include L3 facts'),
  },
  async ({ query, limit, include_secrets }) => {
    const db = load();
    let hits = search(db, query, limit);
    if (!include_secrets) hits = hits.filter((h) => h.fact.level !== 'L3');
    db.stats.searches += 1;
    const returned = hits.reduce(
      (acc, h) => acc + estimateTokens(`${h.fact.label} ${h.fact.content}`),
      0,
    );
    db.stats.tokens_returned += returned;
    save(db);
    if (!hits.length) {
      return ok('No facts found. Save one with memory_add.', {
        ok: true,
        query,
        facts: [],
        total: db.facts.length,
      });
    }
    const text = hits
      .map((h) => `[${h.fact.level}] ${h.fact.label}: ${h.fact.content} (${h.score.toFixed(2)})`)
      .join('\n');
    return ok(text, {
      ok: true,
      query,
      facts: hits.map((h) => ({
        id: h.fact.id,
        label: h.fact.label,
        content: h.fact.content,
        level: h.fact.level,
        score: h.score,
        created: h.fact.created,
        hash: h.fact.hash,
      })),
      tokens_returned: returned,
      total: db.facts.length,
    });
  },
);

server.tool(
  'memory_verify',
  'Check factual claims against local memory: CONFIRMED, CONTRADICTS, PARTIAL or NOT FOUND per claim. Use before stating facts about the user, projects, numbers or dates.',
  {
    claims: z.array(z.string().min(1).max(500)).min(1).max(20).describe('Claims to check'),
    mode: z.enum(['fast', 'full', 'auto']).optional().default('auto'),
  },
  async ({ claims }) => {
    const db = load();
    const results = claims.map((c) => verify(db, c));
    const marks: Record<string, string> = {
      confirmed: 'CONFIRMED',
      contradicts: 'CONTRADICTS',
      partial: 'PARTIAL',
      not_found: 'NOT FOUND',
    };
    const text = results
      .map((r) => {
        const src = r.source ? ` — memory: ${r.source.label} (${r.source.level})` : '';
        return `${marks[r.status]} "${r.claim}"${src}`;
      })
      .join('\n');
    return ok(text, {
      ok: true,
      results: results.map((r) => ({
        claim: r.claim,
        status: r.status,
        score: r.score,
        source: r.source
          ? { id: r.source.id, label: r.source.label, level: r.source.level, created: r.source.created }
          : null,
      })),
      total: db.facts.length,
    });
  },
);

server.tool(
  'memory_provenance',
  'Audit local memory: verify the hash chain, show facts with origin and timestamps.',
  { limit: z.number().min(1).max(50).optional().default(10) },
  async ({ limit }) => {
    const db = load();
    const chain = verifyChain(db);
    const recent = db.facts.slice(-limit).reverse();
    const text = [
      `Chain: ${chain.ok ? 'intact' : `BROKEN in ${chain.broken} of ${chain.total} facts`}`,
      `Facts: ${chain.total} · file: ${dbPath()}`,
      ...recent.map((f) => `${f.created.slice(0, 19)} [${f.level}] ${f.label} · ${f.hash.slice(0, 12)}`),
    ].join('\n');
    return ok(text, {
      ok: chain.ok,
      chain_ok: chain.ok,
      broken: chain.broken,
      total: chain.total,
      file: dbPath(),
      recent: recent.map((f) => ({
        id: f.id,
        label: f.label,
        level: f.level,
        created: f.created,
        hash: f.hash,
        source: f.source,
      })),
    });
  },
);

server.tool(
  'memory_forget',
  'Delete a fact by exact label or id. Requires confirm=true.',
  {
    target: z.string().min(1).max(200).describe('Exact label or fact id'),
    confirm: z.boolean().default(false),
  },
  async ({ target, confirm }) => {
    if (!confirm) {
      return fail(
        `Refusing to delete "${target}" without confirm=true. Repeat the call with confirm=true to delete.`,
        { ok: false, needs_confirm: true },
      );
    }
    const db = load();
    const res = forgetFact(db, target);
    save(db);
    const text = res.removed
      ? `Deleted ${res.removed}: ${res.labels.join(', ')}`
      : `Nothing matched "${target}"`;
    return ok(text, { ok: true, removed: res.removed, labels: res.labels, total: db.facts.length });
  },
);

server.tool(
  'memory_usage',
  'Show local memory size and how much context it saves versus pasting facts into the prompt.',
  {},
  async () => {
    const db = load();
    const stored = db.facts.reduce(
      (acc, f) => acc + estimateTokens(`${f.label} ${f.content}`),
      0,
    );
    const avg = db.stats.searches ? Math.round(db.stats.tokens_returned / db.stats.searches) : 0;
    const text = [
      `Facts: ${db.facts.length} (${stored} tokens stored)`,
      `Searches: ${db.stats.searches}, avg ${avg} tokens per search`,
      `Saved per search vs full dump: ~${Math.max(0, stored - avg)} tokens`,
      `File: ${dbPath()}`,
      API_KEY && BASE_URL ? 'Cloud mirror: configured (best-effort)' : 'Cloud mirror: off (local only)',
    ].join('\n');
    return ok(text, {
      ok: true,
      facts: db.facts.length,
      tokens_stored: stored,
      searches: db.stats.searches,
      avg_tokens_returned: avg,
      file: dbPath(),
      cloud: Boolean(API_KEY && BASE_URL),
    });
  },
);

server.tool(
  'thread_memory',
  'Thread memory: add a message, read recent context, search the thread, or compress older messages into a digest.',
  {
    action: z.enum(['add', 'context', 'ask', 'compress']),
    text: z.string().max(20000).optional().describe('Message text (add)'),
    role: z.enum(['user', 'assistant']).optional().default('user'),
    topic: z.string().max(200).optional(),
    query: z.string().max(500).optional().describe('What to look for (ask)'),
    keep: z.number().min(1).max(50).optional().default(6),
  },
  async ({ action, text, role, topic, query, keep }) => {
    const db = load();
    if (action === 'add') {
      if (!text) return fail('text is required for action=add');
      db.thread.push({ role, text, at: new Date().toISOString(), topic });
      save(db);
      return ok(`Message added (${db.thread.length} in thread)`, { ok: true, total: db.thread.length });
    }
    if (action === 'context') {
      const n = keep ?? 6;
      const recent = db.thread.slice(-n);
      if (!recent.length) return ok('Thread is empty.', { ok: true, messages: [] });
      return ok(recent.map((m) => `${m.role}: ${m.text}`).join('\n'), {
        ok: true,
        messages: recent,
        total: db.thread.length,
      });
    }
    if (action === 'ask') {
      if (!query) return fail('query is required for action=ask');
      const pseudo: Db = {
        version: 1,
        facts: db.thread.map((m, i) => ({
          id: String(i),
          label: m.topic || m.role,
          content: m.text,
          level: 'L1' as Level,
          created: m.at,
          updated: m.at,
          source: 'thread',
          hash: '',
          prev: '',
        })),
        thread: [],
        stats: { searches: 0, tokens_returned: 0, tokens_stored: 0 },
      };
      const hits = search(pseudo, query, keep ?? 6);
      if (!hits.length) return ok('Nothing found in thread history.', { ok: true, results: [] });
      return ok(hits.map((h) => `${h.fact.label}: ${h.fact.content}`).join('\n'), {
        ok: true,
        results: hits.map((h) => ({ text: h.fact.content, when: h.fact.created, score: h.score })),
      });
    }
    const n = keep ?? 6;
    if (db.thread.length <= n) {
      return ok(`Nothing to compress (${db.thread.length} messages, keeping ${n}).`, {
        ok: true,
        compressed: 0,
      });
    }
    const old = db.thread.slice(0, db.thread.length - n);
    const recent = db.thread.slice(-n);
    const before = old.reduce((acc, m) => acc + estimateTokens(m.text), 0);
    const head = old.slice(0, 3).map((m) => `${m.role}: ${m.text.slice(0, 160)}`);
    const digest = `[digest of ${old.length} messages] ${head.join(' | ')}`;
    db.thread = [
      { role: 'user' as const, text: digest, at: new Date().toISOString(), topic: 'digest' },
      ...recent,
    ];
    save(db);
    const after = estimateTokens(digest);
    return ok(`Compressed ${old.length} messages: ${before} -> ${after} tokens`, {
      ok: true,
      compressed: old.length,
      tokens_before: before,
      tokens_after: after,
    });
  },
);

server.tool(
  'web_search',
  'Not available in this build: page fetching and compression ship in a later release.',
  { url: z.string().max(2048), query: z.string().max(500).optional() },
  async () =>
    ok('web_search is not available in this build. Use your own fetch for now.', {
      ok: false,
      available: false,
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`ViBo MCP ${VERSION} ready — local memory at ${dbPath()}`);
