import { liveLaunches } from '@/lib/liveLaunches';
import { clientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const KEEPALIVE_MS = 25_000;
const MAX_STREAMS = 1000;
const MAX_STREAMS_PER_CLIENT = 6;

const perClient = new Map<string, number>();
let total = 0;

/** Server-sent events: new launches, one way, with browser-managed reconnects. */
export async function GET(request: Request) {
    const client = clientIp(request);
    const open = client ? perClient.get(client) ?? 0 : 0;
    if (total >= MAX_STREAMS || open >= MAX_STREAMS_PER_CLIENT) {
        return new Response('Too many streams', { status: 429 });
    }
    if (client) perClient.set(client, open + 1);
    total++;

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream({
        start(controller) {
            const send = (chunk: string) => {
                try {
                    controller.enqueue(encoder.encode(chunk));
                } catch {
                    cleanup();
                }
            };

            const unsubscribe = liveLaunches.subscribe((event) => {
                send(event.type === 'launch'
                    ? `event: launch\ndata: ${JSON.stringify(event.launch)}\n\n`
                    : 'event: resync\ndata: {}\n\n');
            });
            const keepalive = setInterval(() => send(': keepalive\n\n'), KEEPALIVE_MS);

            let closed = false;
            cleanup = () => {
                if (closed) return;
                closed = true;
                clearInterval(keepalive);
                unsubscribe();
                total--;
                if (client) {
                    const remaining = (perClient.get(client) ?? 1) - 1;
                    if (remaining > 0) perClient.set(client, remaining);
                    else perClient.delete(client);
                }
                try {
                    controller.close();
                } catch {
                    // Already closed by the client disconnecting.
                }
            };

            request.signal.addEventListener('abort', cleanup);
            send(': connected\n\n');
        },
        cancel() {
            cleanup();
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no'
        }
    });
}
