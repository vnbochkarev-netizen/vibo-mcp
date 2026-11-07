const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are', 'was', 'were',
    'и', 'в', 'во', 'на', 'с', 'со', 'по', 'для', 'что', 'как', 'это', 'не', 'из', 'от', 'до', 'к',
]);
const SUFFIXES = [
    'иями', 'ями', 'ами', 'ов', 'ев', 'ий', 'ый', 'ая', 'ое', 'ые', 'ых', 'им', 'ем', 'ом', 'ах', 'ях',
    'ing', 'ed', 'es', 's',
];
export function tokenize(text) {
    const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const out = [];
    for (const w of words) {
        if (w.length < 2 || STOP.has(w))
            continue;
        let t = w;
        for (const suf of SUFFIXES) {
            if (t.length - suf.length >= 4 && t.endsWith(suf)) {
                t = t.slice(0, -suf.length);
                break;
            }
        }
        out.push(t);
    }
    return out;
}
function numbers(text) {
    return (text.match(/\d+([.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));
}
function overlap(query, doc) {
    if (!query.length || !doc.length)
        return 0;
    const dset = new Set(doc);
    let hit = 0;
    for (const q of query) {
        if (dset.has(q))
            hit += 1;
        else if (q.length >= 5 && doc.some((d) => d.startsWith(q.slice(0, 5))))
            hit += 0.6;
    }
    return hit / query.length;
}
export function search(db, query, limit = 5) {
    const q = tokenize(query);
    const hits = [];
    const total = db.facts.length;
    for (const fact of db.facts) {
        const doc = tokenize(`${fact.label} ${fact.label} ${fact.content}`);
        const o = overlap(q, doc);
        if (o <= 0)
            continue;
        // Short facts are cheaper to return; slight bonus for label matches.
        const labelO = overlap(q, tokenize(fact.label));
        const score = o * 0.7 + labelO * 0.3 + (total > 0 ? 0.05 / Math.log(2 + total) : 0);
        hits.push({ fact, score: Math.round(score * 1000) / 1000 });
    }
    hits.sort((a, b) => b.score - a.score || a.fact.label.localeCompare(b.fact.label));
    return hits.slice(0, Math.max(1, Math.min(20, limit)));
}
export function verify(db, claim) {
    const hits = search(db, claim, 1);
    if (!hits.length)
        return { claim, status: 'not_found', score: 0 };
    const { fact, score } = hits[0];
    const claimNums = numbers(claim);
    const factNums = numbers(`${fact.label} ${fact.content}`);
    if (score >= 0.6) {
        if (claimNums.length && factNums.length) {
            const same = claimNums.filter((n) => factNums.includes(n)).length;
            if (same === 0)
                return { claim, status: 'contradicts', source: fact, score };
            if (same < claimNums.length)
                return { claim, status: 'partial', source: fact, score };
            return { claim, status: 'confirmed', source: fact, score };
        }
        return { claim, status: 'confirmed', source: fact, score };
    }
    if (score >= 0.35)
        return { claim, status: 'partial', source: fact, score };
    return { claim, status: 'not_found', score };
}
//# sourceMappingURL=search.js.map