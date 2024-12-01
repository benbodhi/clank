/**
 * Configuration for the Clanker Bot
 * @module config
 */

const config = {
    /** Threshold for considering a FID as "low" */
    fidThreshold: 10000,

    /** Clanker contract address on Base */
    clankerContract: '0x9b84fce5dcd9a38d2d01d5d72373f6b6b067c3e1',

    /** Uniswap V3 factory contract address on Base */
    uniswapFactory: '0x33128a8fc17869897dce68ed026d694621f6fdfd',

    /** Base name registrar contract address */
    baseRegistrar: '0x4Ae4d5f12E0E9888Db7750e24dDaF5B2E29e15c0',

    /** Clanker contract ABI */
    clankerAbi: [
        {
            anonymous: false,
            inputs: [
                { indexed: false, name: "tokenAddress", type: "address" },
                { indexed: false, name: "lpNftId", type: "uint256" },
                { indexed: false, name: "deployer", type: "address" },
                { indexed: false, name: "fid", type: "uint256" },
                { indexed: false, name: "name", type: "string" },
                { indexed: false, name: "symbol", type: "string" },
                { indexed: false, name: "supply", type: "uint256" },
                { indexed: false, name: "lockerAddress", type: "address" },
                { indexed: false, name: "castHash", type: "string" }
            ],
            name: "TokenCreated",
            type: "event"
        }
    ],

    /** Uniswap V3 Factory ABI */
    uniswapFactoryAbi: [
        {
            anonymous: false,
            inputs: [
                { indexed: true, name: "token0", type: "address" },
                { indexed: true, name: "token1", type: "address" },
                { indexed: true, name: "fee", type: "uint24" },
                { indexed: false, name: "tickSpacing", type: "int24" },
                { indexed: false, name: "pool", type: "address" }
            ],
            name: "PoolCreated",
            type: "event"
        }
    ],

    /** Base name registrar ABI */
    baseRegistrarAbi: [
        'function reverseNameOf(address addr) external view returns (string memory)',
    ],

    /** Topic hash for PoolCreated event */
    poolCreatedTopic: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118'
};

// Validate addresses
const addressRegex = /^0x[a-fA-F0-9]{40}$/;
if (!addressRegex.test(config.clankerContract)) {
    throw new Error('Invalid Clanker contract address');
}
if (!addressRegex.test(config.uniswapFactory)) {
    throw new Error('Invalid Uniswap factory address');
}
if (!addressRegex.test(config.baseRegistrar)) {
    throw new Error('Invalid Base registrar address');
}

module.exports = config;