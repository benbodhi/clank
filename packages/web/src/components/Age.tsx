'use client';

import { useEffect, useState } from 'react';
import { relativeTime } from '@/lib/format';

/** A self-updating age. Renders nothing until mounted, to avoid a hydration mismatch. */
export function Age({ iso }: { iso: string }) {
    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        setNow(Date.now());
        const young = Date.now() - new Date(iso).getTime() < 60 * 60_000;
        const timer = setInterval(() => setNow(Date.now()), young ? 1000 : 60_000);
        return () => clearInterval(timer);
    }, [iso]);

    return (
        <time dateTime={iso} title={new Date(iso).toUTCString()} className="tabular-nums" suppressHydrationWarning>
            {now === null ? ' ' : relativeTime(iso, now)}
        </time>
    );
}
