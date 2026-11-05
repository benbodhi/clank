import { NextResponse } from 'next/server';
import { getMarketData, type MarketRequest } from '@/lib/market';
import { isRateLimited } from '@/lib/rateLimit';
import { isAddress } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const MAX_TOKENS = 60;

/** Takes `tokens=chainId:address,...`. Malformed entries are ignored. */
export async function GET(request: Request) {
    if (isRateLimited(request, 60)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const tokens: MarketRequest[] = (new URL(request.url).searchParams.get('tokens') ?? '')
        .split(',')
        .map((entry) => entry.split(':'))
        .filter(([chainId, address]) => /^\d{1,12}$/.test(chainId ?? '') && isAddress(address))
        .slice(0, MAX_TOKENS)
        .map(([chainId, address]) => ({ chainId: Number(chainId), address: address! }));

    return NextResponse.json(tokens.length ? await getMarketData(tokens) : {});
}
