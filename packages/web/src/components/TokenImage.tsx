'use client';

import { useState } from 'react';
import { clsx } from 'clsx';

/** Token images come from arbitrary hosts, so they load with no referrer and may fail. */
export function TokenImage({ url, symbol, size }: { url: string | null; symbol: string; size: 'md' | 'lg' }) {
    const [failed, setFailed] = useState(false);
    const dimensions = size === 'lg' ? 'h-20 w-20 text-xl' : 'h-12 w-12 text-sm';

    if (!url || failed) {
        return (
            <div className={clsx(dimensions, 'flex shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-muted-foreground')} aria-hidden>
                {[...symbol].slice(0, 2).join('').toUpperCase()}
            </div>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className={clsx(dimensions, 'shrink-0 rounded-md bg-muted object-cover')}
        />
    );
}
