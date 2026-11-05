export function shortAddress(address: string): string {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function relativeTime(iso: string, now: number): string {
    const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d`;
}

export function compactNumber(value: number): string {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function compactUsd(value: number | null): string {
    return value === null ? '–' : `$${compactNumber(value)}`;
}

export function percent(value: number | null): string {
    if (value === null) return '–';
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function sharePercent(bps: number | null): string {
    if (bps === null) return '';
    return `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
}
