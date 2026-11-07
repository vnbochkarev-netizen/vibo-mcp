import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type Level = 'L1' | 'L2' | 'L3';

export interface Fact {
  id: string;
  label: string;
  content: string;
  level: Level;
  created: string;
  updated: string;
  source: string;
  hash: string;
  prev: string;
}

export interface ThreadMessage {
  role: 'user' | 'assistant';
  text: string;
  at: string;
  topic?: string;
}

export interface Db {
  version: 1;
  facts: Fact[];
  thread: ThreadMessage[];
  stats: { searches: number; tokens_returned: number; tokens_stored: number };
}

export function dbPath(): string {
  const explicit = process.env.VIBO_MEM_FILE;
  if (explicit) return explicit;
  const home = process.env.VIBO_HOME || join(homedir(), '.vibo');
  return join(home, 'mcp', 'memory.json');
}

function emptyDb(): Db {
  return { version: 1, facts: [], thread: [], stats: { searches: 0, tokens_returned: 0, tokens_stored: 0 } };
}

export function load(): Db {
  const p = dbPath();
  if (!existsSync(p)) return emptyDb();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Db;
    if (!raw || !Array.isArray(raw.facts)) return emptyDb();
    raw.thread = Array.isArray(raw.thread) ? raw.thread : [];
    raw.stats = raw.stats || { searches: 0, tokens_returned: 0, tokens_stored: 0 };
    return raw;
  } catch {
    return emptyDb();
  }
}

export function save(db: Db): void {
  const p = dbPath();
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 });
  renameSync(tmp, p);
}

function chainHash(label: string, content: string, prev: string): string {
  return createHash('sha256').update(`${prev}\u0000${label}\u0000${content}`).digest('hex');
}

export function addFact(db: Db, label: string, content: string, level: Level = 'L1', source = 'agent'): { added: boolean; fact?: Fact } {
  const l = label.trim();
  const c = content.trim();
  const dup = db.facts.find((f) => f.label.toLowerCase() === l.toLowerCase() && f.content.trim() === c);
  if (dup) {
    dup.updated = new Date().toISOString();
    return { added: false, fact: dup };
  }
  const prev = db.facts.length ? db.facts[db.facts.length - 1].hash : 'genesis';
  const now = new Date().toISOString();
  const fact: Fact = {
    id: randomUUID(),
    label: l,
    content: c,
    level,
    created: now,
    updated: now,
    source,
    hash: chainHash(l, c, prev),
    prev,
  };
  db.facts.push(fact);
  db.stats.tokens_stored += estimateTokens(`${l} ${c}`);
  return { added: true, fact };
}

export function forgetFact(db: Db, target: string): { removed: number; labels: string[] } {
  const key = target.toLowerCase();
  const keep: Fact[] = [];
  const gone: string[] = [];
  for (const f of db.facts) {
    if (f.id === target || f.label.toLowerCase() === key) gone.push(f.label);
    else keep.push(f);
  }
  db.facts = keep;
  return { removed: gone.length, labels: gone };
}

export function verifyChain(db: Db): { ok: boolean; broken: number; total: number } {
  let prev = 'genesis';
  let broken = 0;
  for (const f of db.facts) {
    const expect = chainHash(f.label, f.content, prev);
    if (f.hash !== expect || f.prev !== prev) broken++;
    prev = f.hash;
  }
  return { ok: broken === 0, broken, total: db.facts.length };
}

export function estimateTokens(text: string): number {
  // Cheap proxy: ~4 characters per token for mixed text, +1 token floor.
  return Math.max(1, Math.round(text.length / 4));
}
