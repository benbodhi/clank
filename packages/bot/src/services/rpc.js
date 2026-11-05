const { FetchRequest, JsonRpcProvider, Network } = require('ethers');

const RPC_TIMEOUT_MS = 15_000;

function createProvider(chain) {
    const network = Network.from(chain.id);
    const request = new FetchRequest(chain.rpcUrl);
    request.timeout = RPC_TIMEOUT_MS;
    return new JsonRpcProvider(request, network, {
        staticNetwork: network, // skips an eth_chainId call per request
        batchMaxCount: 1 // the free tier limits batches, and volume here is low
    });
}

/** Catches an RPC URL pointing at the wrong chain, which would otherwise watch nothing. */
async function assertChainId(provider, chain) {
    const actual = Number(await provider.send('eth_chainId', []));
    if (actual !== chain.id) throw new Error(`${chain.name} RPC reports chain ${actual}, expected ${chain.id}`);
}

module.exports = { createProvider, assertChainId };
