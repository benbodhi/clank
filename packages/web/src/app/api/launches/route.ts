import { NextResponse } from 'next/server';
import { listLaunches } from '@/lib/launches';
import { isRateLimited } from '@/lib/rateLimit';
import { parseFilter, parseLimit } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (isRateLimited(request, 120)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    try {
        const page = await listLaunches({
            filter: parseFilter(searchParams.get('filter')),
            query: searchParams.get('q'),
            cursor: searchParams.get('cursor'),
            limit: parseLimit(searchParams.get('limit'))
        });
        return NextResponse.json(page);
    } catch (error) {
        console.error(`Launch list failed: ${(error as NodeJS.ErrnoException).code ?? 'unknown'}`);
        return NextResponse.json({ error: 'Feed unavailable' }, { status: 503 });
    }
}
