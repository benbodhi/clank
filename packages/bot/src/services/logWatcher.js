const WebSocket = require('ws');
const logger = require('../utils/logger');
const { isPermanent, sleep } = require('../utils/retry');

const SEEN_LIMIT = 5000;
const PERSISTED_SEEN = 500;
const MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024;
const SUBSCRIBE_ID = 1;

function logKey(rawLog) {
    return `${rawLog.transactionHash?.toLowerCase()}:${Number(rawLog.logIndex)}`;
}

/**
 * Delivers each matching log to `onLog` exactly once and in sequence.
 *
 * Two sources feed one queue: a WebSocket subscription for low latency, and a
 * periodic eth_getLogs sweep that guarantees completeness. A dropped or silently
 * dead socket therefore only costs latency, never a missed log, and reconnecting
 * needs no special catch-up logic.
 */
class LogWatcher {
    constructor({ name = 'chain', provider, wsUrl, addresses, topics, onLog, stateStore, options, stats }) {
        this.name = name;
        this.provider = provider;
        this.wsUrl = wsUrl;
        this.filter = { address: addresses, topics: [topics] };
        this.onLog = onLog;
        this.stateStore = stateStore;
        this.options = options;
        this.stats = stats;

        this.seen = new Map();
        this.queue = Promise.resolve();
        this.nextBlock = null;
        this.sweeping = null;
        this.retryBlock = null;
        this.stopped = false;
        this.ws = null;
        this.pingTimer = null;
        this.reconnectTimer = null;
        this.sweepTimer = null;
        this.reconnectAttempts = 0;
    }

    async start() {
        const state = await this.stateStore.load();
        for (const key of state.recent) this.seen.set(key, true);

        const head = await this.fetchSweepHead();
        this.nextBlock = state.nextBlock ?? head + 1;
        logger.info(`${this.name}: watching from block ${this.nextBlock} (head ${head})`);

        this.connect();
        await this.sweep();
        this.sweepTimer = setInterval(() => this.sweep(), this.options.reconcileIntervalMs);
    }

    async stop() {
        this.stopped = true;
        clearInterval(this.sweepTimer);
        clearInterval(this.pingTimer);
        clearTimeout(this.reconnectTimer);
        this.ws?.terminate();

        await Promise.race([
            Promise.all([this.sweeping, this.queue]),
            sleep(10_000)
        ]);
        await this.saveState();
    }

    enqueue(rawLog, source) {
        if (rawLog.removed || this.stopped) return;
        const key = logKey(rawLog);
        if (this.seen.has(key)) return;

        // False until handled, so a crash mid-way can't persist it as done.
        this.seen.set(key, false);
        if (this.seen.size > SEEN_LIMIT) this.seen.delete(this.seen.keys().next().value);

        this.stats.logsSeen++;
        if (source === 'sweep') this.stats.logsFoundBySweep++;

        this.queue = this.queue
            .then(() => this.onLog(rawLog))
            .then(() => this.seen.set(key, true))
            .catch((error) => this.handleFailure(rawLog, key, error));
    }

    /**
     * A failure a retry can't fix drops that log. Anything else, like a Discord or RPC
     * outage, forgets the log and holds the sweep back so it's tried again until it
     * works, or until the gap passes maxCatchupBlocks.
     */
    handleFailure(rawLog, key, error) {
        if (isPermanent(error)) {
            this.seen.set(key, true);
            this.stats.failed++;
            logger.failure(`Dropped log ${key}`, error);
            return;
        }
        this.seen.delete(key);
        this.stats.retrying++;
        const block = Number(rawLog.blockNumber);
        this.retryBlock = this.retryBlock === null ? block : Math.min(this.retryBlock, block);
        logger.failure(`Log ${key} failed, will retry on the next sweep`, error);
    }

    /** Moves the sweep back to any failed log. Returns true if it had to. */
    applyRetries() {
        if (this.retryBlock === null) return false;
        this.nextBlock = Math.min(this.nextBlock, this.retryBlock);
        this.retryBlock = null;
        return true;
    }

    async fetchSweepHead() {
        const head = Number(await this.provider.send('eth_blockNumber', []));
        return head - this.options.confirmationBlocks;
    }

    /** Runs one sweep, or returns the one already running. Never rejects. */
    sweep() {
        this.sweeping ??= this.runSweep()
            .catch((error) => logger.failure('Log sweep failed, will retry', error))
            .finally(() => { this.sweeping = null; });
        return this.sweeping;
    }

    async runSweep() {
        const { logRangeBlocks, maxCatchupBlocks, catchupPauseMs } = this.options;
        this.applyRetries();
        const head = await this.fetchSweepHead();

        const backlog = head - this.nextBlock + 1;
        if (backlog > maxCatchupBlocks) {
            const skipTo = head - maxCatchupBlocks + 1;
            logger.warn(`${this.name}: down too long, skipping blocks ${this.nextBlock}-${skipTo - 1}`);
            this.nextBlock = skipTo;
        }

        try {
            while (!this.stopped && this.nextBlock <= head) {
                const from = this.nextBlock;
                const to = Math.min(from + logRangeBlocks - 1, head);
                const logs = await this.provider.send('eth_getLogs', [{
                    ...this.filter,
                    fromBlock: `0x${from.toString(16)}`,
                    toBlock: `0x${to.toString(16)}`
                }]);

                for (const rawLog of logs) this.enqueue(rawLog, 'sweep');
                await this.queue; // advance only once these logs are handled

                // Stopping discards anything just fetched, so it must not count as done.
                if (this.stopped || this.applyRetries()) return;
                this.nextBlock = to + 1;

                if (this.nextBlock <= head) await sleep(catchupPauseMs);
            }
        } finally {
            await this.saveState();
        }
    }

    saveState() {
        if (this.nextBlock === null) return Promise.resolve();
        return this.stateStore.save({
            nextBlock: this.nextBlock,
            recent: [...this.seen].filter(([, handled]) => handled).map(([key]) => key).slice(-PERSISTED_SEEN)
        });
    }

    connect() {
        if (this.stopped || !this.wsUrl) return;

        const ws = new WebSocket(this.wsUrl, {
            handshakeTimeout: 15_000,
            maxPayload: MAX_WS_PAYLOAD_BYTES
        });
        this.ws = ws;
        let alive = true;

        ws.on('open', () => {
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: SUBSCRIBE_ID,
                method: 'eth_subscribe',
                params: ['logs', this.filter]
            }));
            clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => {
                if (!alive) {
                    logger.warn('WebSocket stopped responding to pings, reconnecting');
                    ws.terminate();
                    return;
                }
                alive = false;
                ws.ping();
            }, this.options.wsPingIntervalMs);
        });

        ws.on('pong', () => { alive = true; });
        ws.on('message', (data) => this.handleMessage(ws, data));
        ws.on('error', (error) => logger.warn(`WebSocket error: ${error.message}`));
        ws.on('close', () => {
            clearInterval(this.pingTimer);
            if (!this.stopped) this.scheduleReconnect();
        });
    }

    handleMessage(ws, data) {
        let message;
        try {
            message = JSON.parse(data);
        } catch {
            logger.warn('Ignoring malformed WebSocket message');
            return;
        }

        if (message.id === SUBSCRIBE_ID) {
            if (message.error) {
                logger.error(`Log subscription rejected: ${message.error.message}`);
                ws.close();
                return;
            }
            logger.info(`${this.name}: WebSocket subscribed to Clanker factories`);
            this.reconnectAttempts = 0;
            this.sweep(); // pick up anything from while the socket was down
            return;
        }

        if (message.method === 'eth_subscription' && message.params?.result) {
            this.enqueue(message.params.result, 'websocket');
        }
    }

    scheduleReconnect() {
        const backoff = Math.min(1000 * 2 ** this.reconnectAttempts, this.options.wsMaxBackoffMs);
        const delay = backoff + Math.random() * 1000;
        this.reconnectAttempts++;
        this.stats.wsReconnects++;
        logger.warn(`${this.name}: WebSocket closed, reconnecting in ${Math.round(delay / 1000)}s`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
}

module.exports = LogWatcher;
