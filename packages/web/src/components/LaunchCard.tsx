import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { CopyAddress } from './CopyAddress';
import { Age } from './Age';
import { Identity } from './Identity';
import { SignalPills } from './Signals';
import { TokenImage } from './TokenImage';
import { compactUsd, percent } from '@/lib/format';
import { tokenPath, tradeLinks } from '@/lib/links';
import type { Launch, MarketData } from '@/lib/types';
import { vetSignals } from '@/lib/vet';

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={`truncate text-sm font-medium tabular-nums ${tone ?? ''}`}>{value}</dd>
        </div>
    );
}

export function LaunchCard({ launch, market, isNew }: { launch: Launch; market?: MarketData; isNew?: boolean }) {
    const signals = vetSignals(launch).slice(1);
    const warnings = market?.warnings ?? [];
    const change = market?.priceChange1h ?? null;
    const buy = tradeLinks(launch)[0]!;
    const path = tokenPath(launch);
    const tax = launch.buyTaxPercent === null ? 'LP fee' : `${launch.buyTaxPercent}% / ${launch.sellTaxPercent}%`;

    return (
        <article className={`flex flex-col gap-3 rounded-lg border bg-card p-4 ${isNew ? 'animate-launch-in' : ''}`}>
            <div className="flex items-start gap-3">
                <TokenImage url={launch.imageUrl} symbol={launch.symbol} size="md" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 className="truncate font-semibold">
                            <Link href={path} className="underline-offset-2 hover:underline">{launch.name}</Link>
                        </h2>
                        <span className="shrink-0 text-xs text-muted-foreground"><Age iso={launch.launchedAt} /></span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="truncate font-medium text-muted-foreground">${launch.symbol}</span>
                        <span className="shrink-0 rounded-sm bg-muted px-1 py-px text-muted-foreground">{launch.source === 'bankr' ? 'Bankr' : launch.version}</span>
                        {launch.chainKey !== 'base' && (
                            <span className="shrink-0 rounded-sm bg-muted px-1 py-px text-muted-foreground">{launch.chainName}</span>
                        )}
                        <CopyAddress address={launch.tokenAddress} />
                    </div>
                </div>
            </div>

            <Identity launch={launch} />

            {(signals.length > 0 || warnings.length > 0) && (
                <SignalPills signals={[
                    ...signals,
                    ...warnings.map((warning) => ({
                        level: 'danger' as const,
                        label: warning.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
                        detail: "Clanker flagged this launch's setup as unusual."
                    }))
                ]} />
            )}

            <dl className="grid grid-cols-3 gap-2 border-t pt-3">
                <Stat label="Market cap" value={compactUsd(market?.marketCap ?? null)} />
                <Stat
                    label="1h"
                    value={percent(change)}
                    tone={change === null ? '' : change >= 0 ? 'text-proven' : 'text-danger'}
                />
                <Stat label="Tax" value={tax} />
            </dl>

            <div className="mt-auto flex gap-2">
                <a
                    href={buy.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                    Buy <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{launch.name} on {buy.label}</span>
                </a>
                <Link
                    href={path}
                    className="inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted"
                >
                    Vet<span className="sr-only"> {launch.name}</span>
                </Link>
            </div>
        </article>
    );
}
