'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { shortAddress } from '@/lib/format';

export function CopyAddress({ address, full = false }: { address: string; full?: boolean }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <button
            type="button"
            onClick={copy}
            aria-label={`Copy address ${address}`}
            className="inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-sm font-mono text-xs text-muted-foreground hover:text-foreground"
        >
            <span className={full ? 'break-all text-left' : 'whitespace-nowrap'}>{full ? address : shortAddress(address)}</span>
            {copied
                ? <Check className="h-3.5 w-3.5 shrink-0 text-proven" aria-hidden />
                : <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
        </button>
    );
}
