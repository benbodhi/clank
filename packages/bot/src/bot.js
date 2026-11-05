const { Client, Events, GatewayIntentBits, Options } = require('discord.js');

const { settings, loadEnv } = require('./config');
const { loadChains } = require('./config/chains');
const { decodeDopplerCreate, launchFilter } = require('./contracts/launchDecoder');
const { createBankrHandler, createLaunchHandler, handleWithRetries } = require('./handlers/launchHandler');
const { BankrFeed } = require('./services/bankrFeed');
const { LaunchStore, noStore } = require('./services/launchStore');
const LogWatcher = require('./services/logWatcher');
const { assertChainId, createProvider } = require('./services/rpc');
const StateStore = require('./services/stateStore');
const { verifyChannelAccess } = require('./utils/discordMessenger');
const { sleep } = require('./utils/retry');
const logger = require('./utils/logger');

const DISCORD_READY_TIMEOUT_MS = 30_000;
const CHAIN_START_RETRY_MS = 60_000;

async function createDiscordClient(token) {
    // Posting only needs the Guilds intent. No privileged intents and no message cache.
    const client = new Client({
        intents: [GatewayIntentBits.Guilds],
        allowedMentions: { parse: [] },
        makeCache: Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,
            MessageManager: 0
        })
    });

    // discord.js reconnects on its own, so these are for visibility only.
    client.on(Events.Error, (error) => logger.failure('Discord client error', error));
    client.on(Events.ShardDisconnect, (event) => logger.warn(`Discord disconnected (${event.code})`));
    client.on(Events.ShardResume, () => logger.info('Discord connection resumed'));

    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for Discord')), DISCORD_READY_TIMEOUT_MS);
        client.once(Events.ClientReady, () => {
            clearTimeout(timer);
            resolve();
        });
    });
    await client.login(token);
    await ready;
    return client;
}

function logDryRun(message) {
    const fields = message.embeds[0].toJSON().fields
        .map((field) => `  ${field.name}: ${field.value.replace(/\n/g, ' / ')}`)
        .join('\n');
    logger.info(`[dry run] would post:\n  content: ${JSON.stringify(message.content)}\n  pings: ${message.allowedMentions.roles.length}\n${fields}`);
}

/** Connects the database if it can. The bot keeps retrying without blocking alerts. */
async function createStore(databaseUrl) {
    if (!databaseUrl) {
        logger.warn('DATABASE_URL is not set: running Discord-only, so the webapp gets no data');
        return noStore;
    }
    const store = new LaunchStore(databaseUrl);
    try {
        await store.migrate();
        logger.info('Database ready');
    } catch (error) {
        logger.failure('Database unavailable, continuing without it and retrying', error);
    }
    return store;
}

/** One chain's watcher. Each has its own provider, so one failing can't affect another. */
function createChainWatcher({ chain, env, store, send, stats, bankrFeed }) {
    const provider = createProvider(chain);
    const handleLaunchLog = createLaunchHandler({ chain, provider, store, send, stats, webUrl: env.webUrl });
    const { addresses, topics } = launchFilter(chain);

    const watcher = new LogWatcher({
        name: chain.name,
        provider,
        wsUrl: chain.wsUrl,
        addresses,
        topics,
        onLog: async (rawLog) => {
            const dopplerToken = decodeDopplerCreate(rawLog, chain);
            if (!dopplerToken) return handleWithRetries(handleLaunchLog, rawLog, stats);
            void bankrFeed?.handleDopplerCreate({ tokenAddress: dopplerToken, createLog: rawLog, chain, provider });
        },
        stateStore: env.databaseUrl ? store.forChain(chain.id) : new StateStore(env.stateFile.replace(/(\.json)?$/, `-${chain.key}.json`)),
        options: { ...settings.watcher, ...chain.watcher },
        stats
    });
    return { chain, provider, watcher };
}

/** Keeps trying to start, so an RPC outage at boot delays a chain instead of killing the bot. */
async function startWhenAvailable({ chain, provider, watcher }, isStopping) {
    while (!isStopping()) {
        try {
            await assertChainId(provider, chain);
            await watcher.start();
            return;
        } catch (error) {
            logger.failure(`${chain.name} failed to start, retrying in ${CHAIN_START_RETRY_MS / 1000}s`, error);
            await sleep(CHAIN_START_RETRY_MS);
        }
    }
}

async function main() {
    const env = loadEnv();
    const stats = {
        logsSeen: 0,
        logsFoundBySweep: 0,
        posted: 0,
        skipped: {},
        failed: 0,
        retrying: 0,
        degraded: 0,
        wsReconnects: 0
    };

    logger.info(env.dryRun ? 'Starting in DRY RUN mode: nothing will be posted' : 'Starting');

    const client = await createDiscordClient(env.discordToken);
    logger.info(`Discord connected as ${client.user.tag}`);
    const channel = await verifyChannelAccess(client, env.channelId, { dryRun: env.dryRun });

    const send = env.dryRun
        ? async (message) => logDryRun(message)
        : (message) => channel.send(message);

    const store = await createStore(env.databaseUrl);
    // Bankr's Source ID is 0 in the state table: it has a position, but isn't a chain.
    const bankrHandler = createBankrHandler({ store, send, stats, webUrl: env.webUrl });
    const bankrFeed = settings.bankr.enabled
        ? new BankrFeed({
            onLaunch: bankrHandler,
            onEnriched: bankrHandler.enrich,
            onUnconfirmed: bankrHandler.markUnconfirmed,
            stateStore: env.databaseUrl ? store.forChain(0) : new StateStore(env.stateFile.replace(/(\.json)?$/, '-bankr.json')),
            options: settings.bankr,
            stats
        })
        : null;

    const watchers = loadChains(env).map((chain) => createChainWatcher({ chain, env, store, send, stats, bankrFeed }));

    const heartbeat = setInterval(() => {
        const positions = Object.fromEntries(watchers.map(({ chain, watcher }) => [chain.key, watcher.nextBlock]));
        logger.info(`Heartbeat: ${JSON.stringify({ ...stats, positions })}`);
    }, settings.heartbeatIntervalMs);

    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`${signal} received, shutting down`);
        clearInterval(heartbeat);
        await Promise.all([...watchers.map(({ watcher }) => watcher.stop()), bankrFeed?.stop()]);
        logger.info(`Final stats: ${JSON.stringify(stats)}`);
        await client.destroy();
        await store.close();
        watchers.forEach(({ provider }) => provider.destroy());
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    logger.info(`Watching ${watchers.map(({ chain }) => chain.name).join(', ')}${bankrFeed ? ', plus Bankr\'s feed' : ''}`);
    await Promise.all([
        ...watchers.map((entry) => startWhenAvailable(entry, () => shuttingDown)),
        bankrFeed?.start().catch((error) => logger.failure('Bankr feed failed to start', error))
    ]);
    logger.info('We are clanking');
}

// A real failure exits non-zero, so the host's restart policy brings the bot back.
function fatal(context, error) {
    logger.failure(context, error);
    process.exit(1);
}

process.on('uncaughtException', (error) => fatal('Uncaught exception', error));
process.on('unhandledRejection', (error) => fatal('Unhandled rejection', error));

main().catch((error) => fatal('Startup failed', error));
