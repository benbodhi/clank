import 'server-only';
import { EventEmitter } from 'node:events';
import { createListenerClient } from './db';
import { getLaunch } from './launches';
import type { Launch } from './types';

const RECONNECT_DELAY_MS = 5000;

export type LiveEvent = { type: 'launch'; launch: Launch } | { type: 'resync' };

/**
 * One Postgres LISTEN connection, fanned out to every browser. It only runs while
 * someone is watching, so an idle site holds no extra connection.
 */
class LiveLaunches {
    private readonly emitter = new EventEmitter().setMaxListeners(0);
    private client: ReturnType<typeof createListenerClient> | null = null;
    private retry: NodeJS.Timeout | null = null;
    private lostConnection = false;

    subscribe(listener: (event: LiveEvent) => void): () => void {
        this.emitter.on('event', listener);
        if (!this.client && !this.retry) void this.connect();

        return () => {
            this.emitter.off('event', listener);
            if (this.emitter.listenerCount('event') === 0) this.disconnect();
        };
    }

    private async connect() {
        const client = createListenerClient();
        this.client = client;

        const handleFailure = () => {
            if (this.client !== client) return;
            this.client = null;
            this.lostConnection = true;
            void client.end().catch(() => {});
            if (this.emitter.listenerCount('event') > 0) {
                this.retry = setTimeout(() => {
                    this.retry = null;
                    void this.connect();
                }, RECONNECT_DELAY_MS);
            }
        };

        client.on('error', handleFailure);
        client.on('end', handleFailure);
        client.on('notification', (message) => {
            const [chainId, address] = message.payload?.split(':') ?? [];
            if (!chainId || !address) return;
            getLaunch(Number(chainId), address)
                .then((launch) => { if (launch) this.emitter.emit('event', { type: 'launch', launch } satisfies LiveEvent); })
                .catch((error) => console.error(`Could not load live launch: ${error.code ?? error.name}`));
        });

        try {
            await client.connect();
            await client.query('LISTEN launches');
            // Launches during the gap sent no notification, so browsers need to refetch.
            if (this.lostConnection) {
                this.lostConnection = false;
                this.emitter.emit('event', { type: 'resync' } satisfies LiveEvent);
            }
        } catch (error) {
            console.error(`Live feed connection failed: ${(error as NodeJS.ErrnoException).code ?? 'unknown'}`);
            handleFailure();
        }
    }

    private disconnect() {
        if (this.retry) clearTimeout(this.retry);
        this.retry = null;
        this.lostConnection = false;
        const client = this.client;
        this.client = null;
        void client?.end().catch(() => {});
    }
}

const shared = globalThis as unknown as { clankLive?: LiveLaunches };
export const liveLaunches = (shared.clankLive ??= new LiveLaunches());
