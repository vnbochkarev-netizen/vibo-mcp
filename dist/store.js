import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
export function dbPath() {
    const explicit = process.env.VIBO_MEM_FILE;
    if (explicit)
        return explicit;
    const home = process.env.VIBO_HOME || join(homedir(), '.vibo');
    return join(home, 'mcp', 'memory.json');
}
function emptyDb() {
    return { version: 1, facts: [], thread: [], stats: { searches: 0, tokens_returned: 0, tokens_stored: 0 } };
}
export function load() {
    const p = dbPath();
    if (!existsSync(p))
        return emptyDb();
    try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        if (!raw || !Array.isArray(raw.facts))
            return emptyDb();
        raw.thread = Array.isArray(raw.thread) ? raw.thread : [];
        raw.stats = raw.stats || { searches: 0, tokens_returned: 0, tokens_stored: 0 };
        return raw;
    }
    catch {
        return emptyDb();
    }
}
export function save(db) {
    const p = dbPath();
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 });
    renameSync(tmp, p);
}
function chainHash(label, content, prev) {
    return createHash('sha256').update(`${prev}\u0000${label}\u0000${content}`).digest('hex');
}
export function addFact(db, label, content, level = 'L1', source = 'agent') {
    const l = label.trim();
    const c = content.trim();
    const dup = db.facts.find((f) => f.label.toLowerCase() === l.toLowerCase() && f.content.trim() === c);
    if (dup) {
        dup.updated = new Date().toISOString();
        return { added: false, fact: dup };
    }
    const prev = db.facts.length ? db.facts[db.facts.length - 1].hash : 'genesis';
    const now = new Date().toISOString();
    const fact = {
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
export function forgetFact(db, target) {
    const key = target.toLowerCase();
    const keep = [];
    const gone = [];
    for (const f of db.facts) {
        if (f.id === target || f.label.toLowerCase() === key)
            gone.push(f.label);
        else
            keep.push(f);
    }
    db.facts = keep;
    return { removed: gone.length, labels: gone };
}
export function verifyChain(db) {
    let prev = 'genesis';
    let broken = 0;
    for (const f of db.facts) {
        const expect = chainHash(f.label, f.content, prev);
        if (f.hash !== expect || f.prev !== prev)
            broken++;
        prev = f.hash;
    }
    return { ok: broken === 0, broken, total: db.facts.length };
}
export function estimateTokens(text) {
    // Cheap proxy: ~4 characters per token for mixed text, +1 token floor.
    return Math.max(1, Math.round(text.length / 4));
}
//# sourceMappingURL=store.js.map