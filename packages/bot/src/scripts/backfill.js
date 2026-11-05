/**
 * Records recent launches in the database without posting to Discord, so a new
 * webapp has history to show. Usage: pnpm backfill [hours], default 3. Base only:
 * pass a chain key as the second argument to choose another configured chain.
 */
const { settings, loadEnv } = require('../config');
const { loadChains } = require('../config/chains');
const { launchFilter } = require('../contracts/launchDecoder');
const { createLaunchHandler, handleWithRetries } = require('../handlers/launchHandler');
const { LaunchStore } = require('../services/launchStore');
const { createProvider } = require('../services/rpc');
const { sleep, withRetries } = require('../utils/retry');
const logger = require('../utils/logger');

const MAX_HOURS = 72;
const SECONDS_PER_HOUR = 3600;

async function main() {
    const env = loadEnv({ requireDiscord: false });
    if (!env.databaseUrl) throw new Error('DATABASE_URL is required to backfill');

    const hours = Number(process.argv[2] ?? 3);
    if (!(hours > 0 && hours <= MAX_HOURS)) throw new Error(`Hours must be between 0 and ${MAX_HOURS}`);

    const chainKey = process.argv[3] ?? 'base';
    const chain = loadChains(env).find((candidate) => candidate.key === chainKey);
    if (!chain) throw new Error(`Chain ${chainKey} is not configured`);
    if (!chain.blockClock) throw new Error(`${chain.name} has no fixed block time, so backfill can't convert hours to blocks`);

    const provider = createProvider(chain);
    const store = new LaunchStore(env.databaseUrl);
    await store.migrate();

    const stats = { posted: 0, skipped: {} };
    const handle = createLaunchHandler({ chain, provider, store, send: null, stats, webUrl: env.webUrl });
    const { addresses, topics } = launchFilter(chain);

    const head = Number(await provider.send('eth_blockNumber', []));
    const start = head - Math.floor((hours * SECONDS_PER_HOUR) / chain.blockClock.secondsPerBlock);
    const { logRangeBlocks } = chain.watcher;
    let found = 0;

    for (let from = start; from <= head; from += logRangeBlocks) {
        const to = Math.min(from + logRangeBlocks - 1, head);
        const logs = await withRetries(() => provider.send('eth_getLogs', [{
            address: addresses,
            topics: [topics],
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`
        }]), { label: `Blocks ${from}-${to}` });

        for (const rawLog of logs) {
            await handleWithRetries(handle, rawLog, stats)
                .catch((error) => logger.failure(`Skipped ${rawLog.transactionHash}`, error));
            found++;
        }
        if ((from - start) % (logRangeBlocks * 90) === 0) {
            logger.info(`Backfill: ${Math.round(((from - start) / (head - start)) * 100)}%, ${found} launches`);
        }
        await sleep(settings.watcher.catchupPauseMs);
    }

    logger.info(`Backfill complete: ${found} launches`);
    await store.close();
    provider.destroy();
}

main().catch((error) => {
    logger.failure('Backfill failed', error);
    process.exit(1);
});
