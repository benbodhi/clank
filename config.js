module.exports = {
    fidThreshold: 20000,
    clankerContract: '0x9b84fce5dcd9a38d2d01d5d72373f6b6b067c3e1',
    uniswapFactory: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
    clankerAbi: [
      {
        "anonymous": false,
        "inputs": [
          { "indexed": false, "name": "tokenAddress", "type": "address" },
          { "indexed": false, "name": "lpNftId", "type": "uint256" },
          { "indexed": false, "name": "deployer", "type": "address" },
          { "indexed": false, "name": "fid", "type": "uint256" },
          { "indexed": false, "name": "name", "type": "string" },
          { "indexed": false, "name": "symbol", "type": "string" },
          { "indexed": false, "name": "supply", "type": "uint256" },
          { "indexed": false, "name": "lockerAddress", "type": "address" },
          { "indexed": false, "name": "castHash", "type": "string" }
        ],
        "name": "TokenCreated",
        "type": "event"
      }
    ],
    uniswapFactoryAbi: [
      {
        "anonymous": false,
        "inputs": [
          { "indexed": true, "name": "token0", "type": "address" },
          { "indexed": true, "name": "token1", "type": "address" },
          { "indexed": true, "name": "fee", "type": "uint24" },
          { "indexed": false, "name": "tickSpacing", "type": "int24" },
          { "indexed": false, "name": "pool", "type": "address" }
        ],
        "name": "PoolCreated",
        "type": "event"
      }
    ],
    poolCreatedTopic: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118'
};