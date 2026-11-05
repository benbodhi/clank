const { Contract, namehash } = require('ethers');
const logger = require('../utils/logger');
const { createTtlCache } = require('./ttlCache');

const RESOLVER_ABI = [
    'function name(bytes32 node) view returns (string)',
    'function addr(bytes32 node) view returns (address)'
];
const BASE_COIN_TYPE = '80002105';
const NAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.base\.eth$/;

const cached = createTtlCache({ ttlMs: 60 * 60_000, maxEntries: 2000 });

/**
 * The wallet's Basename, or null. A reverse record is self-set, so anyone can
 * point theirs at any name. It only counts if that name also resolves forward to
 * this wallet, which only the name's owner can arrange.
 */
function getBasename(address, provider, resolverAddress) {
    return cached(`basename:${address.toLowerCase()}`, async () => {
        try {
            const resolver = new Contract(resolverAddress, RESOLVER_ABI, provider);
            const name = await resolver.name(namehash(`${address.slice(2).toLowerCase()}.${BASE_COIN_TYPE}.reverse`));
            if (!NAME_PATTERN.test(name)) return null;

            const resolved = await resolver.addr(namehash(name));
            return resolved.toLowerCase() === address.toLowerCase() ? name : null;
        } catch (error) {
            logger.warn(`Basename lookup failed for ${address}: ${error.message}`);
            return undefined;
        }
    });
}

module.exports = { getBasename };
