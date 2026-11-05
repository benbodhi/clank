'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, BadgeCheck, ExternalLink, Info, ShieldAlert } from 'lucide-react';
import { Age } from './Age';
import { CopyAddress } from './CopyAddress';
import { Identity } from './Identity';
import { TokenImage } from './TokenImage';
import { compactUsd, percent, sharePercent } from '@/lib/format';
import { castUrl, researchLinks, tradeLinks, txUrl, walletUrl } from '@/lib/links';
import type { Launch, MarketData } from '@/lib/types';
import { vetSignals, type SignalLevel } from '@/lib/vet';

const signalStyle: Record<SignalLevel, { icon: typeof Info; tone: string }> = {
    good: { icon: BadgeCheck, tone: 'text-proven' },
    info: { icon: Info, tone: 'text-muted-foreground' },
    caution: { icon: AlertTriangle, tone: 'text-caution' },
    danger: { icon: ShieldAlert, tone: 'text-danger' }
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{title}</h2>
            {children}
        </section>
    );
}

function WalletRow({ launch, label, note, address }: { launch: Launch; label: string; note?: string; address: string }) {
    return (
        <div className="py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{label}</span>
                <a href={walletUrl(launch, address)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">{launch.explorerName}</a>
            </div>
            {note && <p className="mb-1 text-xs text-muted-foreground">{note}</p>}
            <CopyAddress address={address} full />
        </div>
    );
}

export function TokenDetail({ launch }: { launch: Launch }) {
    const [market, setMarket] = useState<MarketData | null>(null);
    const address = launch.tokenAddress;
    const marketId = `${launch.chainId}:${address.toLowerCase()}`;

    useEffect(() => {
        const load = async () => {
            if (document.hidden) return;
            try {
                const response = await fetch(`/api/market?tokens=${marketId}`);
                if (response.ok) setMarket((await response.json())[marketId] ?? null);
            } catch {
                // Market data is a bonus: the page works without it.
            }
        };
        void load();
        const timer = setInterval(load, 30_000);
        return () => clearInterval(timer);
    }, [marketId]);

    const signals = [
        ...vetSignals(launch),
        ...(market?.warnings ?? []).map((warning) => ({
            level: 'danger' as const,
            label: warning.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
            detail: "Clanker flagged this launch's setup as unusual."
        }))
    ];
    const [primaryTrade, ...otherTrades] = tradeLinks(launch);

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-lg border bg-card p-4">
                <div className="flex items-start gap-4">
                    <TokenImage url={launch.imageUrl} symbol={launch.symbol} size="lg" />
                    <div className="min-w-0 flex-1">
                        <h1 className="break-words text-xl font-bold leading-tight">{launch.name}</h1>
                        <p className="mb-1 text-sm text-muted-foreground">
                            ${launch.symbol} · {launch.version} on {launch.chainName} · <Age iso={launch.launchedAt} /> ago
                        </p>
                        <CopyAddress address={address} full />
                    </div>
                </div>

                <div className="mt-4"><Identity launch={launch} /></div>

                <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
                    {[
                        ['Market cap', compactUsd(market?.marketCap ?? null)],
                        ['24h volume', compactUsd(market?.volume24h ?? null)],
                        ['1h', percent(market?.priceChange1h ?? null)],
                        ['Tax', launch.buyTaxPercent === null ? 'LP fee' : `${launch.buyTaxPercent}% buy / ${launch.sellTaxPercent}% sell`]
                    ].map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="text-sm font-medium tabular-nums">{value}</dd>
                        </div>
                    ))}
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                    <a href={primaryTrade!.href} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 basis-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:basis-0">
                        Buy on {primaryTrade!.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                    {otherTrades.map(({ label, href }) => (
                        <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-4 py-2.5 text-sm font-semibold hover:bg-muted sm:flex-none">
                            {label} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                    ))}
                </div>
            </section>

            <Section title="Vetting">
                <ul className="flex flex-col gap-3">
                    {signals.map((signal) => {
                        const { icon: Icon, tone } = signalStyle[signal.level];
                        return (
                            <li key={signal.label} className="flex gap-2.5">
                                <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden />
                                <div>
                                    <p className={clsx('text-sm font-medium', tone)}>{signal.label}</p>
                                    <p className="text-sm text-muted-foreground">{signal.detail}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    These are automated checks, not advice. A clean result doesn&apos;t make a token safe.
                </p>
            </Section>

            <Section title="Wallets">
                <div className="divide-y">
                    <WalletRow
                        launch={launch}
                        label={launch.deployerIsSigner ? 'Deployer' : 'Sent by'}
                        note={!launch.deployerIsSigner
                            ? 'Launched through another contract, so this proves nothing about who is behind it'
                            : launch.deployerVetted
                                ? 'A Clanker-vetted wallet, deploying for the creator'
                                : launch.deployerName ?? 'Made the deployment, so this is proof of who launched it'}
                        address={launch.deployer}
                    />
                    {launch.creator && launch.creator.toLowerCase() !== launch.deployer.toLowerCase() && (
                        <WalletRow
                            launch={launch}
                            label={launch.deployerVetted ? 'Creator' : 'Token admin'}
                            note={launch.deployerVetted ? undefined : 'Chosen by the deployer, so not proof of involvement'}
                            address={launch.creator}
                        />
                    )}
                    {launch.feeRecipients.map(({ wallet, bps }) => (
                        <WalletRow key={wallet} launch={launch} label={`Fee recipient · ${sharePercent(bps)}`} address={wallet} />
                    ))}
                </div>
            </Section>

            <Section title="Research">
                <div className="flex flex-wrap gap-2">
                    {[
                        ...researchLinks(launch),
                        { label: 'Transaction', href: txUrl(launch) },
                        ...(launch.castHash ? [{ label: 'Launch cast', href: castUrl(launch.castHash) }] : []),
                        ...(launch.xPostUrl ? [{ label: 'Launch post', href: launch.xPostUrl }] : [])
                    ].map(({ label, href }) => (
                        <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                            {label} <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                    ))}
                </div>
            </Section>
        </div>
    );
}
