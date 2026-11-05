const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
const MIGRATION_LOCK_ID = 7_266_001;
const MAX_PENDING = 2000;

const COLUMNS = [
    'chain_id', 'token_address', 'version', 'tx_hash', 'block_number', 'launched_at',
    'name', 'symbol', 'image_url', 'pool_id', 'supply', 'buy_tax_percent', 'sell_tax_percent',
    'deployer', 'deployer_is_signer', 'deployer_vetted', 'deployer_name', 'creator', 'actor', 'fee_recipients',
    'interface', 'platform', 'platform_trusted',
    'identity_kind', 'identity_verified', 'identity_proof', 'fid', 'farcaster_username',
    'follower_count', 'x_handle', 'x_post_url', 'cast_hash', 'linked_role', 'linked_wallet',
    'conflicting_fid', 'skip_reason'
];

const UPSERT_SQL = `
    INSERT INTO launches (${COLUMNS.join(', ')})
    VALUES (${COLUMNS.map((_, index) => `$${index + 1}`).join(', ')})
    ON CONFLICT (chain_id, token_address) DO UPDATE SET
        ${COLUMNS.slice(2).map((column) => `${column} = EXCLUDED.${column}`).join(', ')}
    RETURNING posted`;

const pendingKey = ({ chain_id: chainId, token_address: address }) => `${chainId}:${address}`;

/**
 * Stores launches for the webapp and resume state for the watcher. A database problem
 * must never cost a Discord alert: failed writes are kept in memory and retried, and
 * the bot runs without the database until it comes back.
 */
class LaunchStore {
    constructor(connectionString) {
        this.pool = new Pool({
            connectionString,
            max: 3,
            connectionTimeoutMillis: 10_000,
            statement_timeout: 15_000
        });
        this.pool.on('error', (error) => logger.warn(`Database connection error: ${error.message}`));
        this.migrated = false;
        this.pending = new Map();
    }

    /** Applies pending migrations. The lock keeps concurrent starts from racing. */
    async migrate() {
        const client = await this.pool.connect();
        try {
            await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
            await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
                name text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )`);
            const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));

            const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
            for (const file of files.filter((name) => !applied.has(name))) {
                const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
                    await client.query('COMMIT');
                    logger.info(`Applied migration ${file}`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    throw error;
                }
            }
            this.migrated = true;
        } finally {
            await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
            client.release();
        }
    }

    async upsert(record) {
        const values = COLUMNS.map((column) =>
            column === 'fee_recipients' ? JSON.stringify(record[column]) : record[column] ?? null);
        const { rows } = await this.pool.query(UPSERT_SQL, values);
        return rows[0]?.posted === true;
    }

    remember(record, posted) {
        if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value);
        const key = pendingKey(record);
        this.pending.set(key, { record, posted: posted || this.pending.get(key)?.posted === true });
    }

    /** Saves a launch and reports whether a previous attempt already posted it. */
    async saveLaunch(record) {
        try {
            return { alreadyPosted: await this.upsert(record) };
        } catch (error) {
            logger.failure(`Could not save launch ${record.token_address}, will retry`, error);
            this.remember(record, false);
            return { alreadyPosted: false };
        }
    }

    async markPosted(record) {
        try {
            const { rowCount } = await this.pool.query(
                'UPDATE launches SET posted = true WHERE chain_id = $1 AND token_address = $2',
                [record.chain_id, record.token_address]
            );
            if (rowCount === 0) this.remember(record, true);
        } catch (error) {
            logger.failure(`Could not mark ${record.token_address} as posted, will retry`, error);
            this.remember(record, true);
        }
    }

    /** Retries whatever failed earlier. Runs with each state save, every 30 seconds. */
    async recover() {
        if (!this.migrated) {
            try {
                await this.migrate();
                logger.info('Database ready');
            } catch (error) {
                logger.warn(`Database still unavailable: ${error.message}`);
                return;
            }
        }
        for (const [key, { record, posted }] of this.pending) {
            try {
                await this.upsert(record);
                if (posted) {
                    await this.pool.query(
                        'UPDATE launches SET posted = true WHERE chain_id = $1 AND token_address = $2',
                        [record.chain_id, record.token_address]
                    );
                }
                this.pending.delete(key);
            } catch {
                return; // still down, so try again next time
            }
        }
    }

    /** Resume state for one chain, in the same shape as StateStore. */
    forChain(chainId) {
        return {
            load: async () => {
                try {
                    const { rows } = await this.pool.query('SELECT next_block, recent FROM watcher_state WHERE chain_id = $1', [chainId]);
                    if (!rows[0]) return { nextBlock: null, recent: [] };
                    return { nextBlock: Number(rows[0].next_block), recent: rows[0].recent };
                } catch (error) {
                    if (error.code !== '42P01') { // the table not existing yet just means a first run
                        logger.failure('Could not load watcher state, so starting from the chain head', error);
                    }
                    return { nextBlock: null, recent: [] };
                }
            },
            save: async ({ nextBlock, recent }) => {
                await this.recover();
                try {
                    await this.pool.query(
                        `INSERT INTO watcher_state (chain_id, next_block, recent, updated_at) VALUES ($1, $2, $3, now())
                         ON CONFLICT (chain_id) DO UPDATE SET next_block = $2, recent = $3, updated_at = now()`,
                        [chainId, nextBlock, JSON.stringify(recent)]
                    );
                } catch (error) {
                    logger.warn(`Could not save watcher state: ${error.message}`);
                }
            }
        };
    }

    close() {
        return this.pool.end();
    }
}

/** Used when no database is configured, so the bot can run as Discord-only. */
const noStore = {
    saveLaunch: async () => ({ alreadyPosted: false }),
    markPosted: async () => {},
    close: async () => {}
};

module.exports = { LaunchStore, noStore, COLUMNS };
