import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Reports only up or down, and how long ago the newest launch was recorded. */
export async function GET() {
    try {
        const { rows } = await getPool().query('SELECT max(launched_at) AS latest FROM launches');
        return NextResponse.json({ status: 'ok', latestLaunch: rows[0]?.latest ?? null });
    } catch {
        return NextResponse.json({ status: 'unavailable' }, { status: 503 });
    }
}
