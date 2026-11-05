import 'server-only';

const WINDOW_MS = 60_000;
const MAX_TRACKED = 20_000;

const windows = new Map<string, { count: number; resetAt: number }>();

/**
 * The client's IP from the edge proxy, or null if it can't be told. Only the rightmost
 * X-Forwarded-For entry is added by the proxy: anything earlier is client-supplied.
 * Null means limits can't be applied per client, rather than lumping everyone together.
 */
export function clientIp(request: Request): string | null {
    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
    return request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || null;
}

/** A fixed-window limit per client. One instance is enough for this traffic. */
export function isRateLimited(request: Request, limitPerMinute: number): boolean {
    const key = clientIp(request);
    if (!key) return false;

    const now = Date.now();
    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
        if (windows.size >= MAX_TRACKED) windows.clear();
        windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return false;
    }
    current.count++;
    return current.count > limitPerMinute;
}
