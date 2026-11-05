const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const BASE_WATCHER = {
    /** Blocks per eth_getLogs call. Alchemy's free tier allows 10; raise on a paid plan. */
    logRangeBlocks: 10,
    /** Longest gap to catch up after downtime (900 blocks is about 30 minutes on Base). */
    maxCatchupBlocks: 900
};

function createBase(alchemyApiKey) {
    return {
        key: 'base',
        name: 'Base',
        id: 8453,
        rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
        wsUrl: `wss://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
        factories: {
            v4: '0xE85A59c628F7d27878ACeB4bf3b35733630083a9',
            v5: '0x572e88D3cD7f23E4241EB6ceDD96667271bF09A0',
            v5Hook: '0x5E320eA6278107968C119942E57d876c5F922AcC'
        },
        // Base produces a block exactly every 2 seconds, so a block's time needs no RPC call.
        blockClock: { genesisTimestamp: 1686789347, secondsPerBlock: 2 },
        basenameResolver: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
        // Doppler's Airlock, which Bankr launches through on Base.
        dopplerAirlock: '0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12',
        // What marks a launch as Bankr's: its protocol fee going to these wallets, in this
        // ratio. Faking that means giving Bankr the fees. Observed, not documented by Bankr,
        // so the feed flags any launch this misses (see BankrFeed.runPoll).
        bankrSignature: {
            hook: '0x9982538f41f2ae29ddb9d3d9307010052984FDBb',
            beneficiaries: {
                '0x042455f9990098e11592be1fbd72e6dc68419b13': 333333333333333333n,
                '0x5f8da8f88ec81e27f2e22fcb9ca5d926c595e508': 666666666666666667n
            }
        },
        watcher: BASE_WATCHER,
        explorer: { name: 'Basescan', url: 'https://basescan.org' },
        tradeLinks: (token) => [
            ['Uniswap', `https://app.uniswap.org/swap?chain=base&outputCurrency=${token}`],
            ['Matcha', `https://matcha.xyz/tokens/base/${token}`],
            ['Clanker', `https://www.clanker.world/clanker/${token}`]
        ],
        researchLinks: (token, poolId) => [
            ['Dexscreener', `https://dexscreener.com/base/${token}`],
            ['GeckoTerminal', `https://www.geckoterminal.com/base/pools/${poolId}`]
        ],
        walletLinks: (address) => [['Etherscan', `https://etherscan.io/address/${address}`]]
    };
}

/**
 * Elysium, Kinetiq's Hyperliquid L2. Its mainnet details weren't published when this
 * was written, so it's configured entirely from the environment: set these once
 * Clanker publishes its factories there. Returns null until then.
 */
function createElysium(env) {
    const read = (name) => env[name]?.trim() || '';
    const id = Number(read('ELYSIUM_CHAIN_ID'));
    const rpcUrl = read('ELYSIUM_RPC_URL');
    const wsUrl = read('ELYSIUM_WS_URL');
    const explorerUrl = read('ELYSIUM_EXPLORER_URL').replace(/\/$/, '');
    const factories = {
        v4: read('ELYSIUM_FACTORY_V4'),
        v5: read('ELYSIUM_FACTORY_V5'),
        v5Hook: read('ELYSIUM_V5_HOOK')
    };

    if (!rpcUrl && !factories.v4 && !factories.v5) return null;

    const problems = [];
    if (!Number.isSafeInteger(id) || id <= 0) problems.push('ELYSIUM_CHAIN_ID');
    if (!rpcUrl.startsWith('https://')) problems.push('ELYSIUM_RPC_URL');
    if (wsUrl && !wsUrl.startsWith('wss://')) problems.push('ELYSIUM_WS_URL');
    if (!explorerUrl.startsWith('https://')) problems.push('ELYSIUM_EXPLORER_URL');
    if (!factories.v4 && !factories.v5) problems.push('ELYSIUM_FACTORY_V4 or ELYSIUM_FACTORY_V5');
    if (factories.v5 && !factories.v5Hook) problems.push('ELYSIUM_V5_HOOK');
    for (const [name, value] of Object.entries(factories)) {
        if (value && !ADDRESS.test(value)) problems.push(`Elysium ${name} address`);
    }
    if (problems.length) throw new Error(`Invalid Elysium configuration: ${problems.join(', ')}`);

    return {
        key: 'elysium',
        name: 'Elysium',
        id,
        rpcUrl,
        wsUrl: wsUrl || null,
        factories: {
            ...(factories.v4 ? { v4: factories.v4 } : {}),
            ...(factories.v5 ? { v5: factories.v5, v5Hook: factories.v5Hook } : {})
        },
        blockClock: null,
        basenameResolver: null,
        // Orbit chains make blocks far faster than Base, and this RPC isn't Alchemy's free tier.
        watcher: {
            logRangeBlocks: Number(read('ELYSIUM_LOG_RANGE_BLOCKS')) || 1000,
            maxCatchupBlocks: Number(read('ELYSIUM_MAX_CATCHUP_BLOCKS')) || 20_000
        },
        explorer: { name: 'Explorer', url: explorerUrl },
        tradeLinks: (token) => [['Clanker', `https://www.clanker.world/clanker/${token}`]],
        researchLinks: () => [],
        walletLinks: () => []
    };
}

/** Every chain configured in this environment. Base is always first. */
function loadChains({ alchemyApiKey, env = process.env }) {
    return [createBase(alchemyApiKey), createElysium(env)].filter(Boolean);
}

module.exports = { loadChains, createBase, createElysium };
