const { getAddress } = require('ethers');
const logger = require('../utils/logger');
const { blockTime, identifyBankrLaunch, readTokenMetadata } = require('../contracts/launchDecoder');
const { isPermanent, sleep } = require('../utils/retry');
const { safeXHandle, safeXPostUrl } = require('../utils/sanitize');

const FEED_URL = 'https://api.bankr.bot/token-launches';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_FUTURE_SKEW_MS = 60 * 60_000;
const MAX_REMEMBERED = 500;

/**
 * Bankr's API took 36-58 seconds to show launches when measured, so these wait longer
 * than that, then give up after 5 minutes.
 */
const CONFIRMATION_DELAYS_MS = [20_000, 40_000, 60_000, 60_000, 60_000, 60_000];

/** Bankr's chain names, as they appear in its feed. Anything else is ignored. */
const NETWORKS = {
    base: {
        key: 'base',
        name: 'Base',
        id: 8453,
        onChain: true,
        explorer: { name: 'Basescan', url: 'https://basescan.org' },
        extraTrade: (token) => [
            ['Uniswap', `https://app.uniswap.org/swap?chain=base&outputCurrency=${token}`],
            ['Matcha', `https://matcha.xyz/tokens/base/${token}`]
        ],
        researchLinks: (token, poolId) => [
            ['Dexscreener', `https://dexscreener.com/base/${token}`],
            ...(poolId ? [['GeckoTerminal', `https://www.geckoterminal.com/base/pools/${poolId}`]] : [])
        ]
    },
    robinhood: {
        key: 'robinhood',
        name: 'Robinhood Chain',
        id: 4663,
        explorer: { name: 'Explorer', url: 'https://robin.etherscan.io' }
    },
    arbitrum: {
        key: 'arbitrum',
        name: 'Arbitrum',
        id: 42161,
        explorer: { name: 'Arbiscan', url: 'https://arbiscan.io' },
        researchLinks: (token) => [['Dexscreener', `https://dexscreener.com/arbitrum/${token}`]]
    }
};

/** A network in the shape the Discord messenger expects. */
function networkAsChain(network) {
    return {
        ...network,
        tradeLinks: (token) => [
            ['Bankr', `https://bankr.bot/trade/${token}`],
            ...(network.extraTrade?.(token) ?? [])
        ],
        researchLinks: network.researchLinks ?? (() => []),
        walletLinks: () => []
    };
}

function safeAddress(value) {
    try {
        return typeof value === 'string' ? getAddress(value.toLowerCase()) : null;
    } catch {
        return null;
    }
}

/**
 * Validates one entry from Bankr's feed. The feed comes from Bankr, but names, images
 * and handles in it are chosen by whoever launched the token. Returns null for
 * anything incomplete, not deployed, or on an unsupported chain.
 */
function parseBankrLaunch(raw, now = Date.now()) {
    if (raw?.status !== 'deployed') return null;
    const network = Object.hasOwn(NETWORKS, raw.chain ?? '') ? NETWORKS[raw.chain] : null;
    const tokenAddress = safeAddress(raw.tokenAddress);
    const deployer = safeAddress(raw.deployer?.walletAddress);
    if (!network || !tokenAddress || !deployer) return null;
    if (!/^0x[0-9a-fA-F]{64}$/.test(raw.txHash ?? '')) return null;
    if (!Number.isFinite(raw.timestamp) || raw.timestamp <= 0 || raw.timestamp > now + MAX_FUTURE_SKEW_MS) return null;

    const feeWallet = safeAddress(raw.feeRecipient?.walletAddress);
    return {
        network,
        tokenAddress,
        deployer,
        transactionHash: raw.txHash,
        launchedAt: new Date(raw.timestamp),
        launchType: /^[a-z0-9_]{1,20}$/.test(raw.launchType ?? '') ? raw.launchType : 'bankr',
        poolId: /^0x[0-9a-fA-F]{64}$/.test(raw.poolId ?? '') ? raw.poolId : null,
        name: raw.tokenName,
        symbol: raw.tokenSymbol,
        image: raw.imageUri,
        xHandle: safeXHandle(raw.deployer?.xUsername),
        xPostUrl: safeXPostUrl(raw.tweetUrl),
        feeRecipient: feeWallet ? { wallet: feeWallet, xHandle: safeXHandle(raw.feeRecipient?.xUsername) } : null
    };
}

/** One token's launch from Bankr, or null if Bankr doesn't know it. */
async function fetchBankrToken(tokenAddress) {
    const response = await fetch(`${FEED_URL}/${tokenAddress}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Bankr lookup returned ${response.status}`);
    return (await response.json())?.launch ?? null;
}

async function fetchBankrFeed() {
    const response = await fetch(FEED_URL, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Bankr feed returned ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.launches)) throw new Error('Bankr feed returned an unexpected shape');
    return body.launches;
}

/**
 * Tracks Bankr launches from two directions. On chains we watch, the transaction itself
 * identifies the launch, for real time alerts, and Bankr's API then fills in the X account
 * and image. Polling Bankr's feed of its 50 latest launches catches anything missed, and
 * is the only source on chains we don't watch.
 *
 * The first run records what's already there without alerting, so a new deployment
 * can't ping a role 50 times. After that, a launch that fails is simply left unseen,
 * so the next poll retries it. One older than `maxAlertAgeMs` is recorded silently.
 */
class BankrFeed {
    constructor({ fetchLaunches = fetchBankrFeed, fetchToken = fetchBankrToken, onLaunch, onEnriched, onUnconfirmed, stateStore, options, stats, confirmationDelaysMs = CONFIRMATION_DELAYS_MS }) {
        this.fetchLaunches = fetchLaunches;
        this.fetchToken = fetchToken;
        this.onEnriched = onEnriched;
        this.onUnconfirmed = onUnconfirmed;
        this.confirmationDelaysMs = confirmationDelaysMs;
        this.onLaunch = onLaunch;
        this.stateStore = stateStore;
        this.options = options;
        this.stats = stats;
        this.seen = new Set();
        this.initialized = false;
        this.running = null;
        this.stopped = false;
        this.timer = null;
    }

    async start() {
        const state = await this.stateStore.load();
        this.initialized = state.nextBlock !== null;
        for (const key of state.recent) this.seen.add(key);

        await this.poll();
        this.timer = setInterval(() => this.poll(), this.options.pollIntervalMs);
    }

    async stop() {
        this.stopped = true;
        clearInterval(this.timer);
        await this.running;
    }

    /**
     * Handles a Doppler launch seen on-chain, if it's Bankr's. Runs outside the log queue,
     * so these calls can't delay Clanker alerts. Never rejects: if it fails, the next feed
     * poll still picks the launch up.
     */
    async handleDopplerCreate({ tokenAddress, createLog, chain, provider }) {
        try {
            const receipt = await provider.send('eth_getTransactionReceipt', [createLog.transactionHash]);
            const identified = receipt && identifyBankrLaunch(receipt, createLog, chain);
            if (!identified) return;

            const { name, symbol } = await readTokenMetadata(tokenAddress, provider);
            const launch = {
                network: NETWORKS[chain.key],
                tokenAddress,
                deployer: identified.deployer,
                transactionHash: createLog.transactionHash,
                launchedAt: blockTime(chain, Number(createLog.blockNumber)) ?? new Date(),
                launchType: 'doppler',
                poolId: identified.poolId,
                name,
                symbol,
                image: null,
                xHandle: null,
                xPostUrl: null,
                feeRecipient: null
            };
            if (await this.ingest(launch, Date.now())) void this.confirm(launch);
        } catch (error) {
            logger.warn(`Could not process Doppler launch ${tokenAddress}: ${error.message}`);
        }
    }

    /** Waits for Bankr's API to report a launch found on-chain, then adds what only it knows. */
    async confirm(launch) {
        for (const delay of this.confirmationDelaysMs) {
            await sleep(delay);
            if (this.stopped) return;
            try {
                const raw = await this.fetchToken(launch.tokenAddress);
                const reported = raw ? parseBankrLaunch(raw) : null;
                if (reported?.network.id === launch.network.id) {
                    await this.onEnriched?.(reported);
                    return;
                }
            } catch (error) {
                logger.debug(`Bankr lookup for ${launch.tokenAddress} failed: ${error.message}`);
            }
        }
        if (this.stopped) return;
        logger.warn(`Bankr never confirmed on-chain match ${launch.tokenAddress}`);
        await this.onUnconfirmed?.(launch);
    }

    /**
     * Handles a launch once, whichever path finds it first. A launch that fails is
     * forgotten, so the next poll retries it. Returns false only in that case.
     */
    async ingest(launch, now) {
        const key = `${launch.network.id}:${launch.tokenAddress}`;
        if (this.seen.has(key)) return true;
        this.seen.add(key);

        const silent = !this.initialized || now - launch.launchedAt.getTime() > this.options.maxAlertAgeMs;
        try {
            await this.onLaunch(launch, { silent });
            return true;
        } catch (error) {
            if (isPermanent(error)) {
                this.stats.failed++;
                logger.failure(`Dropped Bankr launch ${key}`, error);
                return true;
            }
            this.seen.delete(key);
            this.stats.retrying++;
            logger.failure(`Bankr launch ${key} failed, will retry on the next poll`, error);
            return false;
        }
    }

    /** Runs one poll, or returns the one already running. Never rejects. */
    poll() {
        this.running ??= this.runPoll()
            .catch((error) => logger.failure('Bankr feed poll failed, will retry', error))
            .finally(() => { this.running = null; });
        return this.running;
    }

    async runPoll() {
        const now = Date.now();
        const launches = (await this.fetchLaunches())
            .map((raw) => parseBankrLaunch(raw, now))
            .filter(Boolean)
            .sort((a, b) => a.launchedAt - b.launchedAt);

        let failed = false;
        for (const launch of launches) {
            if (this.stopped) break;
            // A live launch that reaches here on a watched chain slipped past the on-chain path,
            // which is the sign that Bankr has changed how its launches look.
            const key = `${launch.network.id}:${launch.tokenAddress}`;
            if (this.initialized && !this.seen.has(key) && launch.network.onChain && now - launch.launchedAt.getTime() < this.options.maxAlertAgeMs) {
                this.stats.missedOnChain = (this.stats.missedOnChain ?? 0) + 1;
                logger.warn(`Bankr launch ${launch.tokenAddress} wasn't caught on-chain: check the Bankr signature in chains.js`);
            }
            if (!await this.ingest(launch, now)) failed = true;
        }

        // If the first run failed part-way, stay silent until it has recorded everything.
        if (!failed && !this.stopped) this.initialized = true;
        await this.stateStore.save({
            nextBlock: this.initialized ? now : 1,
            recent: [...this.seen].slice(-MAX_REMEMBERED)
        });
        this.seen = new Set([...this.seen].slice(-MAX_REMEMBERED));
    }
}

module.exports = { BankrFeed, NETWORKS, networkAsChain, parseBankrLaunch, fetchBankrFeed, fetchBankrToken };
