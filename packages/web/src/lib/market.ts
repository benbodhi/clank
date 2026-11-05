import 'server-only';
import type { MarketData } from './types';

const CACHE_TTL_MS = 20_000;
const MAX_CACHE_ENTRIES = 5000;
const REQUEST_TIMEOUT_MS = 6000;

const cache = new Map<string, { data: MarketData; expires: number }>();

export interface MarketRequest {
    chainId: number;
    address: string;
}

export const marketKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMarketData(token: any): MarketData {
    const market = token?.related?.market ?? {};
    const warnings = Array.isArray(token?.warnings)
        ? token.warnings.filter((warning: unknown): warning is string => typeof warning === 'string' && /^[A-Z_]{1,40}$/.test(warning))
        : [];
    return {
        // Clanker reports 0 until a token has traded, which means no data yet, not worthless.
        marketCap: asNumber(market.marketCap) || null,
        priceUsd: asNumber(market.priceUsd) ?? asNumber(token?.priceUsd),
        volume24h: asNumber(market.volume24h),
        priceChange1h: asNumber(market.priceChangePercent1h),
        warnings
    };
}

/** Market data and Clanker's warning tags. Best effort: tokens it can't fetch are omitted. */
export async function getMarketData(tokens: MarketRequest[]): Promise<Record<string, MarketData>> {
    const now = Date.now();
    const result: Record<string, MarketData> = {};
    const missing: MarketRequest[] = [];

    for (const token of tokens) {
        const key = marketKey(token.chainId, token.address);
        const hit = cache.get(key);
        if (hit && hit.expires > now) result[key] = hit.data;
        else missing.push(token);
    }
    if (!missing.length) return result;

    try {
        const response = await fetch('https://www.clanker.world/api/tokens/fetch-by-addresses', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tokens: missing }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            cache: 'no-store'
        });
        if (!response.ok) return result;

        const body = await response.json();
        if (cache.size > MAX_CACHE_ENTRIES) cache.clear();
        for (const token of Array.isArray(body?.data) ? body.data : []) {
            if (typeof token?.contract_address !== 'string') continue;
            const key = marketKey(Number(token.chain_id), token.contract_address);
            const data = toMarketData(token);
            cache.set(key, { data, expires: now + CACHE_TTL_MS });
            result[key] = data;
        }
    } catch (error) {
        console.error(`Market data request failed: ${(error as Error).name}`);
    }
    return result;
}
