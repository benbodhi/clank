const test = require('node:test');
const assert = require('node:assert/strict');
const { getAddress } = require('ethers');
const { BankrFeed, parseBankrLaunch } = require('../src/services/bankrFeed');
const { createBankrHandler } = require('../src/handlers/launchHandler');

const TOKEN = '0xa280cca7bb5182588d5314383327abc31d26eba3';
const WALLET = '0xc76c973b4d6f7ab3599e4312d51bf4f9487039a4';
const ROLE = '123456789012345678';
const NOW = 1793858509377;

const raw = (overrides = {}) => ({
    status: 'deployed',
    launchType: 'doppler',
    tokenName: 'Agent-Desktop',
    tokenSymbol: 'ADESK',
    chain: 'base',
    imageUri: 'ipfs://bafkreidq',
    tokenAddress: TOKEN,
    poolId: `0x${'ab'.repeat(32)}`,
    txHash: `0x${'cd'.repeat(32)}`,
    deployer: { walletAddress: WALLET, xUsername: 'someone' },
    feeRecipient: { walletAddress: WALLET, xUsername: 'someone' },
    tweetUrl: 'https://x.com/someone/status/2118222162347855897',
    timestamp: NOW,
    ...overrides
});

const parsed = (overrides, now = NOW) => parseBankrLaunch(raw(overrides), now);

test('parses a real-shaped launch and checksums its addresses', () => {
    const launch = parsed();
    assert.equal(launch.network.key, 'base');
    assert.match(launch.tokenAddress, /[A-F]/);
    assert.equal(launch.xHandle, 'someone');
    assert.equal(launch.launchedAt.getTime(), NOW);
});

test('rejects anything unusable', () => {
    assert.equal(parsed({ status: 'failed' }), null, 'failed launches');
    assert.equal(parsed({ chain: 'arc' }), null, 'unsupported chain');
    assert.equal(parsed({ chain: '__proto__' }), null, 'prototype key as chain');
    assert.equal(parsed({ chain: 'constructor' }), null);
    assert.equal(parsed({ tokenAddress: "0x'; DROP" }), null);
    assert.equal(parsed({ txHash: 'nope' }), null);
    assert.equal(parsed({ deployer: {} }), null);
    assert.equal(parsed({ timestamp: NOW + 7_200_000 }), null, 'far future');
    assert.equal(parsed({ timestamp: 'soon' }), null);
});

test('hostile handles and links are dropped', () => {
    const launch = parsed({ tweetUrl: 'https://evil.example/x', deployer: { walletAddress: WALLET, xUsername: '[x](http://e)' } });
    assert.equal(launch.xHandle, null);
    assert.equal(launch.xPostUrl, null);
});

function feed({ launches, onLaunch, state = { nextBlock: 1700000000000, recent: [] } }) {
    const saved = [];
    return {
        saved,
        feed: new BankrFeed({
            fetchLaunches: async () => launches(),
            onLaunch,
            stateStore: { load: async () => state, save: async (next) => saved.push(next) },
            options: { pollIntervalMs: 1000, maxAlertAgeMs: 30 * 60_000 },
            stats: { failed: 0, retrying: 0 }
        })
    };
}

const fresh = (overrides) => raw({ timestamp: Date.now(), ...overrides });

test('the first run records existing launches silently, so a role is not pinged 50 times', async () => {
    const calls = [];
    const { feed: f, saved } = feed({
        state: { nextBlock: null, recent: [] },
        launches: () => [fresh()],
        onLaunch: async (launch, options) => calls.push(options.silent)
    });
    f.initialized = false;
    await f.runPoll();
    assert.deepEqual(calls, [true]);
    assert.equal(saved.at(-1).recent.length, 1);
    assert.equal(f.initialized, true);
});

test('after that, new launches alert once, and repeats are ignored', async () => {
    const calls = [];
    const { feed: f } = feed({ launches: () => [fresh()], onLaunch: async (launch, options) => calls.push(options.silent) });
    f.initialized = true;
    await f.runPoll();
    await f.runPoll();
    assert.deepEqual(calls, [false]);
});

test('launches found after long downtime are recorded without alerting', async () => {
    const calls = [];
    const { feed: f } = feed({
        launches: () => [raw({ timestamp: Date.now() - 3_600_000 })],
        onLaunch: async (launch, options) => calls.push(options.silent)
    });
    f.initialized = true;
    await f.runPoll();
    assert.deepEqual(calls, [true]);
});

test('an outage keeps the alert: the next poll retries it', async () => {
    let down = true;
    const sent = [];
    const { feed: f } = feed({
        launches: () => [fresh()],
        onLaunch: async (launch) => {
            if (down) throw new Error('discord is down');
            sent.push(launch.tokenAddress);
        }
    });
    f.initialized = true;
    await f.runPoll();
    assert.equal(f.stats.retrying, 1);
    assert.deepEqual(sent, []);
    down = false;
    await f.runPoll();
    assert.equal(sent.length, 1);
});

test('a failed first run stays silent until it has recorded everything', async () => {
    let down = true;
    const calls = [];
    const { feed: f } = feed({
        state: { nextBlock: null, recent: [] },
        launches: () => [fresh()],
        onLaunch: async (launch, options) => {
            if (down) throw new Error('db down');
            calls.push(options.silent);
        }
    });
    f.initialized = false;
    await f.runPoll();
    assert.equal(f.initialized, false);
    down = false;
    await f.runPoll();
    assert.deepEqual(calls, [true]);
});

test('a feed failure is survived', async () => {
    const { feed: f } = feed({ launches: () => { throw new Error('503'); }, onLaunch: async () => {} });
    await f.poll();
});

const receipt = require('./fixtures/bankr-receipt.json');
const savedCreateLog = require('./fixtures/doppler-create.json');
const { createBase } = require('../src/config/chains');
const { identifyBankrLaunch } = require('../src/contracts/launchDecoder');
const chain = createBase('k');

// The saved launch, as if it had just happened. Older ones are recorded without alerting.
const currentBlock = Math.floor((Date.now() / 1000 - chain.blockClock.genesisTimestamp) / chain.blockClock.secondsPerBlock);
const createLog = { ...savedCreateLog, blockNumber: `0x${currentBlock.toString(16)}`, tokenAddress: getAddress(savedCreateLog.tokenAddress) };

function liveFeed({ fetchToken = async () => null, onLaunch = async () => {}, onEnriched, onUnconfirmed, confirmationDelaysMs = [0, 0] }) {
    const f = new BankrFeed({
        fetchLaunches: async () => [],
        fetchToken,
        onLaunch,
        onEnriched,
        onUnconfirmed,
        stateStore: { load: async () => ({ nextBlock: 1, recent: [] }), save: async () => {} },
        options: { pollIntervalMs: 1000, maxAlertAgeMs: 30 * 60_000 },
        stats: { failed: 0, retrying: 0 },
        confirmationDelaysMs
    });
    f.initialized = true;
    return f;
}

test('a real Bankr launch is recognised from its receipt alone, with its real deployer', () => {
    const found = identifyBankrLaunch(receipt, createLog, chain);
    assert.ok(found);
    assert.match(found.poolId, /^0x[0-9a-f]{64}$/);
    assert.notEqual(found.deployer.toLowerCase(), receipt.from.toLowerCase(), 'tx.from is only the bundler');
});

test('the hook alone is not enough: other fee wallets, shares or reverted transactions are rejected', () => {
    const swapWallet = (log) => ({ ...log, data: log.data.replace('042455f9990098e11592be1fbd72e6dc68419b13', '1111111111111111111111111111111111111111') });
    const fake = { ...receipt, logs: receipt.logs.map(swapWallet) };
    assert.equal(identifyBankrLaunch(fake, createLog, chain), null);
    const noFeeLog = { ...receipt, logs: receipt.logs.filter((log) => log.address.toLowerCase() !== chain.bankrSignature.hook.toLowerCase()) };
    assert.equal(identifyBankrLaunch(noFeeLog, createLog, chain), null);
    assert.equal(identifyBankrLaunch({ ...receipt, status: '0x0' }, createLog, chain), null);
    assert.equal(identifyBankrLaunch(receipt, createLog, { ...chain, bankrSignature: undefined }), null);
});

function onChainArgs(receiptResult = receipt) {
    return {
        tokenAddress: createLog.tokenAddress,
        createLog,
        chain,
        provider: {
            send: async () => receiptResult,
            // Answers name() and symbol() with an ABI-encoded string.
            call: async () => `0x${'20'.padStart(64, '0')}${'4'.padStart(64, '0')}${Buffer.from('TEST').toString('hex').padEnd(64, '0')}`,
            resolveName: async (name) => name
        }
    };
}

test('a launch found on-chain alerts at once, before Bankr has said anything', async () => {
    const sent = [];
    const f = liveFeed({ onLaunch: async (launch, options) => sent.push({ launch, ...options }), confirmationDelaysMs: [] });
    await f.handleDopplerCreate(onChainArgs());
    assert.equal(sent.length, 1);
    assert.equal(sent[0].silent, false);
    assert.equal(sent[0].launch.name, 'TEST');
    assert.equal(sent[0].launch.xHandle, null);
});

test('another launchpad\'s Doppler launch is ignored', async () => {
    const sent = [];
    const f = liveFeed({ onLaunch: async () => sent.push(1) });
    await f.handleDopplerCreate(onChainArgs({ ...receipt, logs: [] }));
    assert.equal(sent.length, 0);
});

test('Bankr\'s API then fills in the X account and image', async () => {
    const enriched = [];
    let tries = 0;
    const f = liveFeed({ fetchToken: async () => (++tries < 2 ? null : fresh()), onEnriched: async (launch) => enriched.push(launch) });
    await f.confirm(parsed());
    assert.equal(tries, 2);
    assert.equal(enriched[0].xHandle, 'someone');
});

test('a match Bankr never confirms is flagged', async () => {
    const flagged = [];
    const f = liveFeed({ onUnconfirmed: async (launch) => flagged.push(launch) });
    await f.confirm(parsed());
    assert.equal(flagged.length, 1);
});

test('the poll does not repeat a launch already caught on-chain', async () => {
    const sent = [];
    const launch = fresh({ tokenAddress: createLog.tokenAddress });
    const f = liveFeed({ onLaunch: async () => sent.push(1), confirmationDelaysMs: [] });
    f.fetchLaunches = async () => [launch];
    await f.handleDopplerCreate(onChainArgs());
    await f.runPoll();
    assert.equal(sent.length, 1);
    assert.equal(f.stats.missedOnChain, undefined);
});

test('a live Base launch only the poll saw is flagged as a missed on-chain match', async () => {
    const sent = [];
    const f = liveFeed({ onLaunch: async () => sent.push(1) });
    f.fetchLaunches = async () => [fresh()];
    await f.runPoll();
    assert.equal(sent.length, 1, 'still alerts');
    assert.equal(f.stats.missedOnChain, 1);
});

test('if the on-chain path fails, the next poll still sends the alert', async () => {
    let down = true;
    const sent = [];
    const launch = fresh({ tokenAddress: createLog.tokenAddress });
    const f = liveFeed({ onLaunch: async () => { if (down) throw new Error('discord down'); sent.push(1); }, confirmationDelaysMs: [] });
    f.fetchLaunches = async () => [launch];
    await f.handleDopplerCreate(onChainArgs());
    down = false;
    await f.runPoll();
    assert.equal(sent.length, 1);
});

test('adding details edits the alert without sending another', async () => {
    const edits = [];
    const message = { edit: async (next) => { edits.push(next); } };
    const handlerFresh = createBankrHandler({
        store: { saveLaunch: async () => ({ alreadyPosted: false }), markPosted: async () => {} },
        send: async () => message,
        stats: { posted: 0, skipped: {} },
        services: { getUserByAddress: async () => null }
    });
    await handlerFresh({ ...parsed(), xHandle: null, image: null });
    await handlerFresh.enrich(parsed());
    assert.equal(edits.length, 1);
    assert.match(JSON.stringify(edits[0].embeds[0].toJSON()), /someone/);
    await handlerFresh.markUnconfirmed(parsed());
    assert.equal(edits.length, 1, 'only one pending edit per alert');
});

test('an unconfirmed match loses the genuine label', async () => {
    const edits = [];
    const saved = [];
    const handler = createBankrHandler({
        store: { saveLaunch: async (record) => { saved.push(record); return { alreadyPosted: false }; }, markPosted: async () => {} },
        send: async () => ({ edit: async (next) => edits.push(next) }),
        stats: { posted: 0, skipped: {} },
        services: { getUserByAddress: async () => null }
    });
    await handler(parsed());
    await handler.markUnconfirmed(parsed());
    assert.match(JSON.stringify(edits[0].embeds[0].toJSON()), /Self-reported/);
    assert.equal(saved.at(-1).platform_trusted, false);
});

function handlerWith(services, saved = [], sent = []) {
    return createBankrHandler({
        store: { saveLaunch: async (record) => { saved.push(record); return { alreadyPosted: false }; }, markPosted: async () => {} },
        send: async (message) => sent.push(message),
        stats: { posted: 0, skipped: {} },
        services: { getUserByAddress: async () => null, ...services }
    });
}

test('a Bankr launch pings only the Bankr role, and is labelled genuine', async () => {
    process.env.BANKR_DEPLOYER_ROLE = ROLE;
    process.env.FID_BELOW_1000_ROLE = '223456789012345678';
    try {
        const saved = [];
        const sent = [];
        const famous = { fid: 3, username: 'famous', followerCount: 500000, ethAddresses: [] };
        await handlerWith({ getUserByAddress: async () => famous }, saved, sent)(parsed());
        assert.deepEqual(sent[0].allowedMentions, { parse: [], roles: [ROLE] });
        const text = JSON.stringify(sent[0].embeds[0].toJSON());
        assert.match(text, /bankr\.bot\/trade/);
        assert.ok(!/clanker\.world/.test(text));
        assert.ok(!/Self-reported/.test(text));
        assert.equal(saved[0].source, 'bankr');
        assert.equal(saved[0].platform_trusted, true);
        assert.equal(saved[0].block_number, null);
    } finally {
        delete process.env.BANKR_DEPLOYER_ROLE;
        delete process.env.FID_BELOW_1000_ROLE;
    }
});

test('a Bankr launch with no identity still posts, and fee recipients carry a warning', async () => {
    const sent = [];
    const launch = parsed({ deployer: { walletAddress: WALLET }, feeRecipient: { walletAddress: TOKEN, xUsername: 'victim' } });
    await handlerWith({}, [], sent)(launch);
    const text = JSON.stringify(sent[0].embeds[0].toJSON());
    assert.match(text, /not proof of involvement/);
    assert.match(text, /victim/);
});

test('a silent launch is stored but never posted', async () => {
    const saved = [];
    const sent = [];
    await handlerWith({}, saved, sent)(parsed(), { silent: true });
    assert.equal(saved.length, 1);
    assert.equal(sent.length, 0);
});

test('Robinhood Chain launches use its explorer and Bankr only', async () => {
    const sent = [];
    await handlerWith({}, [], sent)(parsed({ chain: 'robinhood' }));
    const text = JSON.stringify(sent[0].embeds[0].toJSON());
    assert.match(text, /robin\.etherscan\.io/);
    assert.ok(!/basescan|uniswap/i.test(text));
});

test('hostile names render inert in the alert', async () => {
    const sent = [];
    await handlerWith({}, [], sent)(parsed({ tokenName: '[Claim](https://evil.example) @everyone', tokenSymbol: '<@&1>' }));
    const fields = sent[0].embeds[0].toJSON().fields;
    assert.ok(!fields[0].value.includes('](http'));
    assert.deepEqual(sent[0].allowedMentions.roles, []);
});
