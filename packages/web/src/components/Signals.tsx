import { clsx } from 'clsx';
import type { SignalLevel, VetSignal } from '@/lib/vet';

const levelClass: Record<SignalLevel, string> = {
    good: 'border-proven/30 text-proven',
    info: 'border-border text-muted-foreground',
    caution: 'border-caution/40 text-caution',
    danger: 'border-danger/50 bg-danger/10 text-danger'
};

/** Compact pills for the feed. The identity line already covers the first signal. */
export function SignalPills({ signals }: { signals: VetSignal[] }) {
    if (!signals.length) return null;
    return (
        <ul className="flex flex-wrap gap-1.5">
            {signals.map((signal) => (
                <li key={signal.label} title={signal.detail} className={clsx('rounded-sm border px-1.5 py-0.5 text-xs font-medium', levelClass[signal.level])}>
                    {signal.label}
                </li>
            ))}
        </ul>
    );
}
