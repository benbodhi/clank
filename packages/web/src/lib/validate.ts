import type { FeedFilter } from './types.ts';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: string | null | undefined): boolean {
    return typeof value === 'string' && ADDRESS.test(value);
}

export function parseFilter(value: string | null): FeedFilter {
    return value === 'proven' || value === 'bankr' || value === 'all' ? value : 'identified';
}

export function parseLimit(value: string | null, fallback = 30, max = 60): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export interface Cursor {
    launchedAt: string;
    tokenAddress: string;
}

export function encodeCursor(cursor: Cursor): string {
    return Buffer.from(`${cursor.launchedAt}|${cursor.tokenAddress}`).toString('base64url');
}

/** Returns null for anything malformed, so bad cursors can't reach a query. */
export function decodeCursor(value: string | null): Cursor | null {
    if (!value || value.length > 200) return null;
    const [launchedAt, tokenAddress] = Buffer.from(value, 'base64url').toString('utf8').split('|');
    if (!tokenAddress || !isAddress(tokenAddress) || !launchedAt || Number.isNaN(Date.parse(launchedAt))) return null;
    return { launchedAt, tokenAddress };
}

/** Escapes LIKE wildcards in user input. */
export function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
}
