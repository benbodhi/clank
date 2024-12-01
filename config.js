/**
 * Configuration for the Clanker Bot
 * @module config
 */

const config = {
    /** Threshold for considering a FID as "low" */
    fidThreshold: 10000,
    /** Threshold for considering a user as "high followers" */
    followerThreshold: 10000,

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

module.exports = config;