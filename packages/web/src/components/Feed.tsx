'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowUp, Search } from 'lucide-react';
import { LaunchCard } from './LaunchCard';
import type { FeedFilter, Launch, LaunchPage, MarketData } from '@/lib/types';

const MARKET_REFRESH_MS = 30_000;
const MARKET_BATCH = 60;
const SCROLLED_DOWN_PX = 240;
const STREAM_RETRY_MS = 5000;

const FILTERS: { value: FeedFilter; label: string; hint: string }[] = [
    { value: 'identified', label: 'Identified', hint: 'Launches with any identity, proven or claimed' },
    { value: 'proven', label: 'Proven', hint: 'Only launches where the identity is proven' },
    { value: 'bankr', label: 'Bankr', hint: 'Launches from Bankr' },
    { value: 'all', label: 'Everything', hint: 'Every launch, including anonymous ones' }
];

type LiveStatus = 'connecting' | 'live' | 'offline';

function matchesFilter(launch: Launch, filter: FeedFilter) {
    if (filter === 'proven') return launch.identityVerified;
    if (filter === 'bankr') return launch.source === 'bankr';
    if (filter === 'identified') return launch.identityKind !== 'none' || launch.source === 'bankr';
    return true;
}

const launchId = (launch: Launch) => `${launch.chainId}:${launch.tokenAddress.toLowerCase()}`;

function dedupe(launches: Launch[]) {
    const seen = new Set<string>();
    return launches.filter((launch) => {
        const id = launchId(launch);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

async function fetchPage(filter: FeedFilter, query: string, cursor?: string | null): Promise<LaunchPage> {
    const params = new URLSearchParams({ filter });
    if (query) params.set('q', query);
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(`/api/launches?${params}`);
    if (!response.ok) throw new Error('Feed unavailable');
    return response.json();
}

export function Feed({ initial }: { initial: LaunchPage | null }) {
    const [filter, setFilter] = useState<FeedFilter>('identified');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [launches, setLaunches] = useState<Launch[]>(initial?.launches ?? []);
    const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
    const [pending, setPending] = useState<Launch[]>([]);
    const [newOnes, setNewOnes] = useState<Set<string>>(new Set());
    const [market, setMarket] = useState<Record<string, MarketData>>({});
    const [status, setStatus] = useState<LiveStatus>('connecting');
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(initial === null);

    const sentinel = useRef<HTMLDivElement>(null);
    const firstRender = useRef(true);
    const view = useRef({ filter, query });
    view.current = { filter, query };

    const reload = useCallback(async () => {
        setLoading(true);
        const requested = view.current;
        try {
            const page = await fetchPage(requested.filter, requested.query);
            if (view.current.filter !== requested.filter || view.current.query !== requested.query) return;
            setLaunches(page.launches);
            setCursor(page.nextCursor);
            setPending([]);
            setFailed(false);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounce typing, then reload when the view changes.
    useEffect(() => {
        const timer = setTimeout(() => setQuery(search.trim()), 250);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        void reload();
    }, [filter, query, reload]);

    // Live updates. While scrolled down, new launches wait behind a button, so the
    // card someone is reading doesn't jump.
    useEffect(() => {
        let source: EventSource | null = null;
        let retry: ReturnType<typeof setTimeout> | null = null;
        let everOpened = false;

        const catchUp = () => {
            if (!view.current.query && window.scrollY <= SCROLLED_DOWN_PX) void reload();
        };

        const open = () => {
            source = new EventSource('/api/launches/stream');
            source.onopen = () => {
                setStatus('live');
                // After a dropped connection, fetch whatever was missed.
                if (everOpened) catchUp();
                everOpened = true;
            };
            source.onerror = () => {
                setStatus('connecting');
                // Browsers retry network errors, but give up for good on an error
                // response, such as during a deploy. So retry those here.
                if (source?.readyState === EventSource.CLOSED) {
                    source.close();
                    retry = setTimeout(open, STREAM_RETRY_MS);
                }
            };
            source.addEventListener('resync', catchUp);
            source.addEventListener('launch', (event) => {
                const launch: Launch = JSON.parse((event as MessageEvent).data);
                if (view.current.query || !matchesFilter(launch, view.current.filter)) return;

                if (window.scrollY > SCROLLED_DOWN_PX) {
                    setPending((current) => dedupe([launch, ...current]));
                } else {
                    setNewOnes((current) => new Set(current).add(launchId(launch)));
                    setLaunches((current) => dedupe([launch, ...current]));
                }
            });
        };

        open();
        return () => {
            if (retry) clearTimeout(retry);
            source?.close();
        };
    }, [reload]);

    const showPending = () => {
        setNewOnes(new Set(pending.map(launchId)));
        setLaunches((current) => dedupe([...pending, ...current]));
        setPending([]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const loadMore = useCallback(async () => {
        if (!cursor || loading) return;
        setLoading(true);
        const requested = view.current;
        try {
            const page = await fetchPage(requested.filter, requested.query, cursor);
            // The view changed while loading, so these cards don't belong in it.
            if (view.current.filter !== requested.filter || view.current.query !== requested.query) return;
            setLaunches((current) => dedupe([...current, ...page.launches]));
            setCursor(page.nextCursor);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [cursor, loading]);

    useEffect(() => {
        const element = sentinel.current;
        if (!element) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0]?.isIntersecting) void loadMore(); },
            { rootMargin: '400px' }
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [loadMore]);

    // Market data and warning tags. New cards load once as they appear, and the newest
    // refresh while the tab is visible.
    const requestedMarket = useRef(new Set<string>());
    const loadMarket = useCallback(async (ids: string[]) => {
        for (let index = 0; index < ids.length; index += MARKET_BATCH) {
            try {
                const response = await fetch(`/api/market?tokens=${ids.slice(index, index + MARKET_BATCH).join(',')}`);
                if (response.ok) {
                    const data = await response.json();
                    setMarket((current) => ({ ...current, ...data }));
                }
            } catch {
                // Market data is a bonus: the feed works without it.
            }
        }
    }, []);

    useEffect(() => {
        const fresh = launches.map(launchId).filter((id) => !requestedMarket.current.has(id));
        fresh.forEach((id) => requestedMarket.current.add(id));
        if (fresh.length) void loadMarket(fresh);
    }, [launches, loadMarket]);

    const newest = useMemo(() => launches.slice(0, MARKET_BATCH).map(launchId), [launches]);
    useEffect(() => {
        const timer = setInterval(() => {
            if (!document.hidden && newest.length) void loadMarket(newest);
        }, MARKET_REFRESH_MS);
        return () => clearInterval(timer);
    }, [newest, loadMarket]);

    return (
        <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div role="group" aria-label="Filter launches" className="flex items-center gap-1 rounded-md border bg-card p-1">
                    {FILTERS.map(({ value, label, hint }) => (
                        <button
                            key={value}
                            type="button"
                            title={hint}
                            aria-pressed={filter === value}
                            onClick={() => setFilter(value)}
                            className={clsx(
                                'flex-1 rounded-sm px-3 py-1.5 text-sm font-medium sm:flex-none',
                                filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <label className="relative block flex-1 sm:w-72 sm:flex-none">
                        <span className="sr-only">Search launches</span>
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <input
                            type="search"
                            value={search}
                            maxLength={100}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Name, ticker, @user, FID or address"
                            className="w-full rounded-md border bg-card py-2 pl-8 pr-3 text-sm placeholder:text-muted-foreground"
                        />
                    </label>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" role="status">
                        <span className={clsx('h-2 w-2 rounded-full', status === 'live' ? 'bg-proven' : status === 'connecting' ? 'bg-caution' : 'bg-danger')} aria-hidden />
                        {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
                    </span>
                </div>
            </div>

            {failed && (
                <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-danger/40 p-4 text-sm">
                    <span>The feed couldn&apos;t load. It may be restarting.</span>
                    <button type="button" onClick={reload} className="shrink-0 rounded-md border px-3 py-1.5 font-medium hover:bg-muted">Try again</button>
                </div>
            )}

            {pending.length > 0 && (
                <button
                    type="button"
                    onClick={showPending}
                    className="fixed left-1/2 top-4 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg"
                >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                    {pending.length} new {pending.length === 1 ? 'launch' : 'launches'}
                </button>
            )}

            {launches.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {launches.map((launch) => (
                        <LaunchCard
                            key={launchId(launch)}
                            launch={launch}
                            market={market[launchId(launch)]}
                            isNew={newOnes.has(launchId(launch))}
                        />
                    ))}
                </div>
            ) : !loading && !failed && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    {query ? 'No launches match that search.' : 'No launches here yet. New ones appear as soon as they happen.'}
                </p>
            )}

            <div ref={sentinel} className="h-12" aria-hidden />
            {loading && launches.length > 0 && <p className="text-center text-sm text-muted-foreground" role="status">Loading…</p>}
        </>
    );
}
