const test = require('node:test');
const assert = require('node:assert/strict');
const logs = require('./fixtures/launch-logs.json');
const txs = require('./fixtures/launch-txs.json');
const { createBase, createElysium, loadChains } = require('../src/config/chains');
const {
    V4_TOPIC, V5_TOPIC, blockTime, decodeLaunchLog, fetchV5Details, launchFilter, parseContext, parseLaunchParams
} = require('../src/contracts/launchDecoder');
const { readClaim } = require('../src/handlers/launchHandler');
const doppler = require('./fixtures/doppler-create.json');
const { DOPPLER_CREATE_TOPIC, decodeDopplerCreate } = require('../src/contracts/launchDecoder');

const base = createBase('test-key');
const ADDRESS = '0x1111111111111111111111111111111111111111';

test('event hashes match the values Clanker publishes', () => {
    assert.equal(V4_TOPIC, '0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67');
    assert.equal(V5_TOPIC, '0x207384e895174175cc774fe7f7457b37c382f27ebf53d37d5257b862f80eaf9c');
});

test('decodes a real v4 launch, including its social context', () => {
    const launch = decodeLaunchLog(logs.v4X, base);
    assert.equal(launch.version, 'v4');
    assert.equal(launch.deployerIsSigner, true);
    assert.match(launch.tokenAddress, /^0x[0-9a-fA-F]{40}$/);
    assert.equal(launch.supply, '100,000,000,000');
    assert.ok(launch.locker);

    const context = parseContext(launch.rawContext);
    assert.equal(context.platform, 'twitter');

    // The on-chain context has no username, so the handle comes from the post's URL.
    assert.equal(context.username, '');
    const claim = readClaim(context);
    assert.equal(claim.handle, 'usoilreserves');
    assert.match(claim.postUrl, /^https:\/\/x\.com\/usoilreserves\/status\/\d+$/);
});

test('block time matches a real Base block', () => {
    assert.equal(blockTime(base, 53531866).toISOString(), '2026-11-05T04:31:19.000Z');
});

test('decodes a real v5 launch without trusting originalCreator as the deployer', () => {
    const launch = decodeLaunchLog(logs.v5Farcaster, base);
    assert.equal(launch.version, 'v5');
    assert.equal(launch.deployer, null);
    assert.equal(launch.deployerIsSigner, false);
    assert.equal(launch.supply, '1,000,000,000');
    assert.match(launch.tokenAddress, /cccc$/i);
});

test('ignores removed logs, other events and other contracts', () => {
    assert.equal(decodeLaunchLog({ ...logs.v4X, removed: true }, base), null);
    assert.equal(decodeLaunchLog({ ...logs.v4X, topics: ['0x00'] }, base), null);
    assert.equal(decodeLaunchLog({ ...logs.v4X, address: ADDRESS }, base), null);
    // A v4 event hash from the v5 factory must not decode as a launch.
    assert.equal(decodeLaunchLog({ ...logs.v4X, address: logs.v5Farcaster.address }, base), null);
});

test('a direct v5 launch is read from its immutable calldata in one call', async () => {
    const launch = decodeLaunchLog(logs.v5Farcaster, base);
    const provider = { getTransaction: async () => txs.v5Farcaster };
    const details = await fetchV5Details(launch, provider, base);

    assert.equal(details.deployerIsSigner, true);
    assert.equal(details.name, 'Stable');
    assert.equal(details.symbol, 'STBL');
    assert.equal(details.buyTaxPercent, 1);
    assert.equal(parseContext(details.rawContext).id, '3351882');
    assert.match(details.image, /^https:\/\//);
});

test('a v5 launch through another contract never counts as signed by its sender', async () => {
    const launch = decodeLaunchLog(logs.v5Farcaster, base);
    const provider = {
        getTransaction: async () => ({ ...txs.v5Farcaster, to: ADDRESS }),
        // Stands in for the token and hook reads: they aren't needed to assert the flag.
        call: async () => { throw new Error('reads are not stubbed'); },
        resolveName: async (name) => name
    };
    await assert.rejects(fetchV5Details(launch, provider, base));
    assert.equal(parseLaunchParams('0xdeadbeef'), null);
});

test('finds the token in a real Doppler launch, and only from the Airlock', () => {
    assert.equal(doppler.topics[0], DOPPLER_CREATE_TOPIC);
    assert.equal(decodeDopplerCreate(doppler, base).toLowerCase(), doppler.tokenAddress.toLowerCase());
    assert.equal(decodeDopplerCreate({ ...doppler, address: ADDRESS }, base), null, 'a fake Airlock');
    assert.equal(decodeDopplerCreate({ ...doppler, removed: true }, base), null);
    assert.equal(decodeDopplerCreate(logs.v4X, base), null);
    assert.equal(decodeDopplerCreate(doppler, createElysium({
        ELYSIUM_CHAIN_ID: '1', ELYSIUM_RPC_URL: 'https://r.example', ELYSIUM_EXPLORER_URL: 'https://e.example', ELYSIUM_FACTORY_V4: ADDRESS
    })), null, 'a chain with no Airlock');
    assert.ok(launchFilter(base).topics.includes(DOPPLER_CREATE_TOPIC));
});

test('parseContext never throws on hostile input', () => {
    for (const input of ['', 'not json', 'null', '[]', '42', '{"id":5}', 'x'.repeat(5000), undefined]) {
        assert.equal(parseContext(input).id, '');
    }
});

test('Elysium stays off until configured, and rejects a partial setup', () => {
    assert.equal(createElysium({}), null);
    assert.deepEqual(loadChains({ alchemyApiKey: 'k', env: {} }).map((chain) => chain.key), ['base']);
    assert.throws(() => createElysium({ ELYSIUM_RPC_URL: 'https://rpc.example' }), /ELYSIUM_CHAIN_ID/);
    assert.throws(() => createElysium({
        ELYSIUM_CHAIN_ID: '1', ELYSIUM_RPC_URL: 'http://insecure.example', ELYSIUM_EXPLORER_URL: 'https://x.example', ELYSIUM_FACTORY_V4: ADDRESS
    }), /ELYSIUM_RPC_URL/);
});

test('a configured Elysium decodes only its own factory', () => {
    const elysium = createElysium({
        ELYSIUM_CHAIN_ID: '999999',
        ELYSIUM_RPC_URL: 'https://rpc.example',
        ELYSIUM_EXPLORER_URL: 'https://explorer.example/',
        ELYSIUM_FACTORY_V4: logs.v4X.address
    });
    assert.deepEqual(launchFilter(elysium).topics, [V4_TOPIC]);
    assert.equal(elysium.explorer.url, 'https://explorer.example');
    assert.equal(blockTime(elysium, 1), null, 'time must come from the chain, not a formula');
    assert.equal(decodeLaunchLog(logs.v4X, elysium).version, 'v4');
    assert.equal(decodeLaunchLog(logs.v5Farcaster, elysium), null);
});
