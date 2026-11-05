import 'server-only';
import { Client, Pool, type ClientConfig } from 'pg';

/**
 * The webapp only ever reads. Every session starts read-only, so even a bug in a
 * query can't change data.
 */
function connectionConfig(): ClientConfig {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    return {
        connectionString,
        options: '-c default_transaction_read_only=on -c statement_timeout=8000',
        connectionTimeoutMillis: 8000
    };
}

const shared = globalThis as unknown as { clankPool?: Pool };

export function getPool(): Pool {
    if (!shared.clankPool) {
        shared.clankPool = new Pool({ ...connectionConfig(), max: 8, idleTimeoutMillis: 30_000 });
        shared.clankPool.on('error', (error) => console.error(`Database pool error: ${(error as NodeJS.ErrnoException).code ?? error.name}`));
    }
    return shared.clankPool;
}

export function createListenerClient(): Client {
    return new Client(connectionConfig());
}
