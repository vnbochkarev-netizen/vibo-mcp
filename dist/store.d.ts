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
    stats: {
        searches: number;
        tokens_returned: number;
        tokens_stored: number;
    };
}
export declare function dbPath(): string;
export declare function load(): Db;
export declare function save(db: Db): void;
export declare function addFact(db: Db, label: string, content: string, level?: Level, source?: string): {
    added: boolean;
    fact?: Fact;
};
export declare function forgetFact(db: Db, target: string): {
    removed: number;
    labels: string[];
};
export declare function verifyChain(db: Db): {
    ok: boolean;
    broken: number;
    total: number;
};
export declare function estimateTokens(text: string): number;
