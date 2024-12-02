/**
 * Configuration for the Clanker Bot
 * @module config
 */

const config = {
    /** FID Thresholds for role notifications */
    fidThresholds: {
        below1000: 1000,
        below5000: 5000,
        below10000: 10000
    },

    /** Follower Thresholds for role notifications */
    followerThresholds: {
        over5000: 5000,
        over10000: 10000,
        over20000: 20000,
        over50000: 50000,
        over100000: 100000,
        over200000: 200000
    },

    /** Contract Addresses */
    contracts: {
        clanker: '0x9b84fce5dcd9a38d2d01d5d72373f6b6b067c3e1',
        uniswapFactory: '0x33128a8fc17869897dce68ed026d694621f6fdfd'
    },

    /** Contract ABIs */
    abis: {
        clanker: [
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
        uniswapFactory: [
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
        ]
    }
};

// Validate addresses
const addressRegex = /^0x[a-fA-F0-9]{40}$/;
Object.entries(config.contracts).forEach(([name, address]) => {
    if (!addressRegex.test(address)) {
        throw new Error(`Invalid ${name} contract address`);
    }
});

// Validate thresholds
Object.entries(config.fidThresholds).forEach(([name, value]) => {
    if (typeof value !== 'number' || value <= 0) {
        throw new Error(`Invalid ${name} FID threshold`);
    }
});

Object.entries(config.followerThresholds).forEach(([name, value]) => {
    if (typeof value !== 'number' || value <= 0) {
        throw new Error(`Invalid ${name} follower threshold`);
    }
});

module.exports = config;