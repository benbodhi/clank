const test = require('node:test');
const assert = require('node:assert/strict');
const logs = require('./fixtures/launch-logs.json');
const { createBase } = require('../src/config/chains');
const { resolveIdentity, createLaunchHandler, handleWithRetries } = require('../src/handlers/launchHandler');
const { LookupError } = require('../src/services/clankerApi');
const { buildMessage } = require('../src/utils/discordMessenger');

const chain = createBase('test-key');
const VETTED = '0xd9aCd656A5f1B519C9E76a2A6092265A74186e58';
const SIGNER = '0x1111111111111111111111111111111111111111';
const FAMOUS = '0x2222222222222222222222222222222222222222';
const ROLE = '123456789012345678';

const famousUser = { fid: 20, username: 'famous', followerCount: 500000, xHandle: 'famous', ethAddresses: [FAMOUS.toLowerCase()] };

function directory(byAddress = {}, byFid = {}) {
    return {
        getUserByAddress: async (address) => byAddress[address.toLowerCase()] ?? null,
        getUserByFid: async (fid) => byFid[fid] ?? null
    };
}

function launchFor(identity, overrides = {}) {
    return buildMessage({
        chain,
        identity,
        platform: null,
        launch: {
            version: 'v4',
            tokenAddress: '0x3333333333333333333333333333333333333333',
            poolId: `0x${'ab'.repeat(32)}`,
            deployer: SIGNER,
            creator: SIGNER,
            name: 'Token',
            symbol: 'TKN',
            image: '',
            supply: '100,000,000,000',
            ...overrides
        }
    });
}

test('a claimed FID from an unrelated wallet is not verified, however famous the FID', async () => {
    const identity = await resolveIdentity(
        { claim: { kind: 'farcaster', fid: 20 }, deployer: SIGNER, deployerIsSigner: true, wallets: [] },
        directory({}, { 20: famousUser })
    );
    assert.equal(identity.verified, false);
    assert.equal(identity.profile, undefined, 'must not borrow the real profile');
});

test('a signing wallet identifies its owner even with no social context', async () => {
    const identity = await resolveIdentity(
        { claim: null, deployer: FAMOUS, deployerIsSigner: true, wallets: [] },
        directory({ [FAMOUS.toLowerCase()]: famousUser })
    );
    assert.equal(identity.verified, true);
    assert.equal(identity.proof, 'wallet');
    assert.equal(identity.fid, 20);
});

test('a vetted deployer vouches for the FID in its context', async () => {
    const identity = await resolveIdentity(
        { claim: { kind: 'farcaster', fid: 20, castHash: '0xabc' }, deployer: VETTED, deployerIsSigner: true, wallets: [] },
        directory({}, { 20: famousUser })
    );
    assert.equal(identity.verified, true);
    assert.equal(identity.proof, 'vetted');
});

test('the SuperBuilder pattern: a famous admin wallet is a link, never proof', async () => {
    const identity = await resolveIdentity(
        { claim: null, deployer: SIGNER, deployerIsSigner: true, wallets: [{ wallet: FAMOUS, role: 'admin' }] },
        directory({ [FAMOUS.toLowerCase()]: famousUser })
    );
    assert.equal(identity.kind, 'linked');
    assert.equal(identity.verified, false);
    assert.equal(launchFor(identity).content, '', 'must not ping');
    assert.deepEqual(launchFor(identity).allowedMentions.roles, []);
});

test('a signer contradicting the claimed FID is flagged', async () => {
    const identity = await resolveIdentity(
        { claim: { kind: 'farcaster', fid: 99 }, deployer: FAMOUS, deployerIsSigner: true, wallets: [] },
        directory({ [FAMOUS.toLowerCase()]: famousUser })
    );
    assert.equal(identity.fid, 20);
    assert.equal(identity.conflictingClaim, 99);
});

test('only verified Farcaster identities ping, and only their configured roles', async () => {
    process.env.FOLLOWERS_OVER_200000_ROLE = ROLE;
    try {
        const verified = launchFor({ kind: 'farcaster', verified: true, proof: 'wallet', fid: 20000, profile: famousUser });
        assert.deepEqual(verified.allowedMentions, { parse: [], roles: [ROLE] });
        assert.match(verified.content, new RegExp(ROLE));

        const unverified = launchFor({ kind: 'farcaster', verified: false, fid: 3 });
        assert.equal(unverified.content, '');
        assert.deepEqual(unverified.allowedMentions, { parse: [], roles: [] });
    } finally {
        delete process.env.FOLLOWERS_OVER_200000_ROLE;
    }
});

test('hostile token text stays inside embed limits and renders inert', () => {
    const message = launchFor({ kind: 'none', verified: false }, {
        name: `[Claim](https://evil.example) @everyone ${'A'.repeat(5000)}`,
        symbol: '<@&1> `x`',
        image: 'javascript:alert(1)'
    });
    const embed = message.embeds[0].toJSON();
    assert.equal(embed.image, undefined);
    for (const field of embed.fields) {
        assert.ok(field.value.length > 0 && field.value.length <= 1024, field.name);
    }
    assert.ok(!embed.fields[0].value.includes('](http'));
    assert.deepEqual(message.allowedMentions.roles, []);
});

function runHandler(log, services, store) {
    const sent = [];
    const stats = { posted: 0, skipped: {} };
    const handler = createLaunchHandler({
        chain,
        provider: null,
        store,
        send: async (message) => sent.push(message),
        stats,
        services: {
            ...directory(),
            getBasename: async () => null,
            fetchFeeRecipients: async () => [],
            fetchDetails: async () => ({
                name: 'Stable',
                symbol: 'STBL',
                image: '',
                rawContext: '{"interface":"clanker.world","platform":"farcaster","id":"3351882"}',
                deployer: VETTED,
                deployerIsSigner: true
            }),
            ...services
        }
    });
    return handler(log).then(() => ({ sent, stats, handler }));
}

test('end to end: an anonymous real v4 launch is skipped', async () => {
    const { sent, stats } = await runHandler(logs.v4Anonymous);
    assert.equal(sent.length, 0);
    assert.equal(stats.skipped['anonymous deployment'], 1);
});

test('end to end: an anonymous launch with a verified Basename is posted without pings', async () => {
    const { sent } = await runHandler(logs.v4Anonymous, { getBasename: async () => 'someone.base.eth' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].content, '');
    assert.ok(sent[0].embeds[0].toJSON().fields.some((field) => field.value.includes('someone')));
});

test('end to end: a real v5 launch via a vetted deployer is posted', async () => {
    const { sent, stats } = await runHandler(logs.v5Farcaster, {
        fetchFeeRecipients: async () => { throw new Error('rpc down'); }
    });
    assert.equal(sent.length, 1, 'a failed fee read must not lose the alert');
    assert.equal(stats.posted, 1);
});

test('every launch is stored, including ones Discord skips', async () => {
    const saved = [];
    const store = {
        saveLaunch: async (record) => { saved.push(record); return { alreadyPosted: false }; },
        markPosted: async () => {}
    };
    await runHandler(logs.v4Anonymous, {}, store);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].skip_reason, 'anonymous deployment');
    assert.equal(saved[0].identity_kind, 'none');
    assert.equal(saved[0].actor, saved[0].deployer.toLowerCase());
});

test('a launch that a previous attempt already posted is not posted again', async () => {
    const store = { saveLaunch: async () => ({ alreadyPosted: true }), markPosted: async () => {} };
    const { sent } = await runHandler(logs.v5Farcaster, {}, store);
    assert.equal(sent.length, 0);
});

test('with a vetted deployer, launches count towards the creator', async () => {
    const saved = [];
    const store = {
        saveLaunch: async (record) => { saved.push(record); return { alreadyPosted: false }; },
        markPosted: async () => {}
    };
    await runHandler(logs.v4X, {}, store);
    assert.equal(saved[0].deployer_vetted, true);
    assert.equal(saved[0].actor, saved[0].creator.toLowerCase());
    assert.equal(saved[0].x_handle, 'usoilreserves');
});

test('a phished signature through another contract proves nothing', async () => {
    const famous = directory({ [FAMOUS.toLowerCase()]: famousUser }, { 20: famousUser });
    const viaContract = await resolveIdentity(
        { claim: null, deployer: FAMOUS, deployerIsSigner: false, wallets: [] }, famous
    );
    assert.equal(viaContract.verified, false);

    const vettedViaContract = await resolveIdentity(
        { claim: { kind: 'farcaster', fid: 20 }, deployer: VETTED, deployerIsSigner: false, wallets: [] }, famous
    );
    assert.equal(vettedViaContract.verified, false, 'a vetted sender through a contract vouches for nothing');
});

test('a launch through another contract is stored and posted without proof or pings', async () => {
    const saved = [];
    const store = { saveLaunch: async (record) => { saved.push(record); return { alreadyPosted: false }; }, markPosted: async () => {} };
    const { sent } = await runHandler(logs.v5Farcaster, {
        fetchDetails: async () => ({
            name: 'Phish', symbol: 'PH', image: '', deployer: FAMOUS, deployerIsSigner: false,
            rawContext: '{"platform":"farcaster","id":"20"}'
        }),
        getUserByAddress: async () => famousUser,
        getUserByFid: async () => famousUser
    }, store);
    assert.equal(saved[0].identity_verified, false);
    assert.equal(saved[0].deployer_is_signer, false);
    assert.equal(saved[0].deployer_vetted, false);
    assert.equal(sent[0].content, '');
    assert.deepEqual(sent[0].allowedMentions.roles, []);
});

test('a failed lookup retries, then the alert goes out without lookups', async () => {
    const stats = {};
    const calls = [];
    const handle = async (log, options) => {
        calls.push(options?.tolerateLookupFailures === true);
        if (!options?.tolerateLookupFailures) throw new LookupError('Clanker API returned 429');
    };
    await handleWithRetries(handle, { transactionHash: '0x1' }, stats, { delaysMs: [0, 0] });
    assert.deepEqual(calls, [false, false, false, true]);
    assert.equal(stats.degraded, 1);
});

test('other failures are not degraded, so the watcher can hold and retry them', async () => {
    const handle = async () => { throw new Error('discord is down'); };
    await assert.rejects(handleWithRetries(handle, { transactionHash: '0x1' }, {}, { delaysMs: [] }), /discord is down/);
});

test('tolerating lookup failures lets a vetted launch through, without follower data', async () => {
    const failing = async () => { throw new LookupError('down'); };
    const sent = [];
    const handler = createLaunchHandler({
        chain, provider: null, send: async (message) => sent.push(message), stats: { posted: 0, skipped: {} },
        services: {
            getUserByAddress: failing, getUserByFid: failing, getBasename: async () => null, fetchFeeRecipients: async () => [],
            fetchDetails: async () => ({ name: 'A', symbol: 'A', image: '', deployer: VETTED, deployerIsSigner: true, rawContext: '{"platform":"farcaster","id":"3"}' })
        }
    });
    await assert.rejects(handler(logs.v5Farcaster), LookupError);
    await handler(logs.v5Farcaster, { tolerateLookupFailures: true });
    assert.equal(sent.length, 1);
});

test('Elysium launches link to its explorer, with no Base-only links', () => {
    const { createElysium } = require('../src/config/chains');
    const elysium = createElysium({
        ELYSIUM_CHAIN_ID: '999999', ELYSIUM_RPC_URL: 'https://rpc.example', ELYSIUM_EXPLORER_URL: 'https://explorer.example', ELYSIUM_FACTORY_V4: SIGNER
    });
    const message = buildMessage({
        chain: elysium, identity: { kind: 'none', verified: false }, platform: null, webUrl: 'https://clank.example',
        launch: { version: 'v4', tokenAddress: SIGNER, poolId: '0x00', deployer: SIGNER, creator: SIGNER, name: 'T', symbol: 'T', image: '', supply: '1', deployerIsSigner: true }
    });
    const text = JSON.stringify(message.embeds[0].toJSON());
    assert.match(text, /explorer\.example\/token/);
    assert.match(text, /clank\.example\/token\/elysium\//);
    assert.ok(!/basescan|uniswap|etherscan/i.test(text));
});
