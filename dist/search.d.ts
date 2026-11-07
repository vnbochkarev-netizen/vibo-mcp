import type { Db, Fact } from './store.js';
export declare function tokenize(text: string): string[];
export interface Hit {
    fact: Fact;
    score: number;
}
export declare function search(db: Db, query: string, limit?: number): Hit[];
export type Verdict = 'confirmed' | 'contradicts' | 'partial' | 'not_found';
export interface VerifyResult {
    claim: string;
    status: Verdict;
    source?: Fact;
    score: number;
}
export declare function verify(db: Db, claim: string): VerifyResult;
