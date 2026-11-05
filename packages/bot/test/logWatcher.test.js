const test = require('node:test');
const assert = require('node:assert/strict');
const LogWatcher = require('../src/services/logWatcher');

const options = {
    logRangeBlocks: 10,
    reconcileIntervalMs: 1000,
    confirmationBlocks: 2,
    maxCatchupBlocks: 100,
    catchupPauseMs: 0,
    wsPingIntervalMs: 1000,
    wsMaxBackoffMs: 1000
};

function makeWatcher({ head, logsFor = () => [], saved = [], onLog = async () => {} }) {
    const calls = [];
    const provider = {
        send: async (method, [params] = []) => {
            if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
            const from = Number(params.fromBlock);
            const to = Number(params.toBlock);
            calls.push([from, to]);
            return logsFor(from, to);
        }
    };
    const watcher = new LogWatcher({
        provider,
        wsUrl: 'wss://unused.invalid',
        addresses: ['0xabc'],
        topics: ['0xdef'],
        onLog,
        stateStore: { load: async () => ({ nextBlock: null, recent: [] }), save: async (state) => saved.push(state) },
        options,
        stats: { logsSeen: 0, logsFoundBySweep: 0, failed: 0, retrying: 0, wsReconnects: 0 }
    });
    return { watcher, calls };
}

const log = (hash, index = 0, block = 5) => ({ transactionHash: hash, logIndex: `0x${index.toString(16)}`, blockNumber: `0x${block.toString(16)}`, topics: [], data: '0x' });

test('sweeps in ranges no wider than the plan limit, leaving no gaps', async () => {
    const { watcher, calls } = makeWatcher({ head: 137 });
    watcher.nextBlock = 100;
    await watcher.sweep();

    assert.deepEqual(calls[0], [100, 109]);
    for (const [from, to] of calls) assert.ok(to - from + 1 <= 10);
    for (let i = 1; i < calls.length; i++) assert.equal(calls[i][0], calls[i - 1][1] + 1);
    assert.equal(calls.at(-1)[1], 135, 'stops at head minus confirmations');
    assert.equal(watcher.nextBlock, 136);
});

test('a log delivered by both WebSocket and sweep is handled once', async () => {
    const handled = [];
    const { watcher } = makeWatcher({
        head: 12,
        logsFor: () => [log('0xAA')],
        onLog: async (rawLog) => handled.push(rawLog.transactionHash)
    });
    watcher.nextBlock = 1;
    watcher.enqueue(log('0xaa'), 'websocket');
    await watcher.sweep();
    assert.equal(handled.length, 1);
    assert.equal(watcher.stats.logsFoundBySweep, 0);
});

test('a log only the sweep sees is recovered and counted', async () => {
    const handled = [];
    const { watcher } = makeWatcher({
        head: 12,
        logsFor: (from) => (from === 1 ? [log('0xbb')] : []),
        onLog: async (rawLog) => handled.push(rawLog.transactionHash)
    });
    watcher.nextBlock = 1;
    await watcher.sweep();
    assert.deepEqual(handled, ['0xbb']);
    assert.equal(watcher.stats.logsFoundBySweep, 1);
});

test('a failed RPC call keeps the position, so nothing is skipped', async () => {
    const { watcher } = makeWatcher({
        head: 30,
        logsFor: (from) => { if (from === 11) throw new Error('rpc down'); return []; }
    });
    watcher.nextBlock = 1;
    await watcher.sweep();
    assert.equal(watcher.nextBlock, 11);
});

test('a permanent failure is dropped without stopping later logs', async () => {
    const handled = [];
    const { watcher } = makeWatcher({
        head: 12,
        onLog: async (rawLog) => {
            if (rawLog.transactionHash === '0x1') throw Object.assign(new Error('bad data'), { permanent: true });
            handled.push(rawLog.transactionHash);
        }
    });
    watcher.enqueue(log('0x1'), 'websocket');
    watcher.enqueue(log('0x2'), 'websocket');
    await watcher.queue;
    assert.deepEqual(handled, ['0x2']);
    assert.equal(watcher.stats.failed, 1);
});

test('catch-up after long downtime is capped', async () => {
    const { watcher, calls } = makeWatcher({ head: 10_000 });
    watcher.nextBlock = 1;
    await watcher.sweep();
    assert.ok(calls[0][0] >= 10_000 - 2 - 100);
});

test('removed logs are ignored', async () => {
    const handled = [];
    const { watcher } = makeWatcher({ head: 1, onLog: async (rawLog) => handled.push(rawLog) });
    watcher.enqueue({ ...log('0x9'), removed: true }, 'websocket');
    await watcher.queue;
    assert.equal(handled.length, 0);
});

test('an outage keeps the alert: the log is retried until it works, and the sweep holds', async () => {
    let outage = true;
    const handled = [];
    const { watcher } = makeWatcher({
        head: 22,
        logsFor: (from) => (from === 1 ? [log('0xaa', 0, 3)] : []),
        onLog: async (rawLog) => {
            if (outage) throw new Error('discord is down');
            handled.push(rawLog.transactionHash);
        }
    });
    watcher.nextBlock = 1;

    await watcher.sweep();
    assert.equal(watcher.nextBlock, 1, 'must not advance past the failed log');
    assert.equal(watcher.stats.retrying, 1);
    assert.deepEqual(handled, []);

    outage = false;
    await watcher.sweep();
    assert.deepEqual(handled, ['0xaa']);
    assert.equal(watcher.nextBlock, 21);
});

test('a WebSocket log that fails is picked up by the next sweep', async () => {
    let outage = true;
    const handled = [];
    const { watcher } = makeWatcher({
        head: 12,
        logsFor: (from, to) => (from <= 2 && to >= 2 ? [log('0xbb', 0, 2)] : []),
        onLog: async (rawLog) => {
            if (outage) throw new Error('down');
            handled.push(rawLog.transactionHash);
        }
    });
    watcher.nextBlock = 11;
    watcher.enqueue(log('0xbb', 0, 2), 'websocket');
    await watcher.queue;
    outage = false;
    await watcher.sweep();
    assert.deepEqual(handled, ['0xbb']);
});

test('stopping during a fetch does not skip the logs it discards', async () => {
    const { watcher } = makeWatcher({
        head: 12,
        logsFor: () => { watcher.stopped = true; return [log('0xcc', 0, 1)]; }
    });
    watcher.nextBlock = 1;
    await watcher.sweep();
    assert.equal(watcher.nextBlock, 1);
});

test('only handled logs are saved as done, so a crash can not lose one', async () => {
    const saved = [];
    let release;
    const blocker = new Promise((resolve) => { release = resolve; });
    const { watcher } = makeWatcher({ head: 1, saved, onLog: () => blocker });
    watcher.nextBlock = 1;
    watcher.enqueue(log('0xdd'), 'websocket');
    await watcher.saveState();
    assert.deepEqual(saved.at(-1).recent, []);
    release();
    await watcher.queue;
    await watcher.saveState();
    assert.deepEqual(saved.at(-1).recent, ['0xdd:0']);
});
