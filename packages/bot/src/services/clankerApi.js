const { safeXHandle } = require('../utils/sanitize');
const { createTtlCache } = require('./ttlCache');

const API_BASE = 'https://www.clanker.world/api';
const REQUEST_TIMEOUT_MS = 8000;

const cached = createTtlCache({ ttlMs: 10 * 60_000, maxEntries: 2000 });

/**
 * The lookup failed, which is different from finding no user. Treating the two alike
 * would make a proven deployer look anonymous whenever this API has a bad moment.
 */
class LookupError extends Error {}

async function fetchUser(path) {
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        throw new LookupError(`Clanker API request failed for ${path}: ${error.message}`);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new LookupError(`Clanker API returned ${response.status} for ${path}`);
    try {
        return await response.json();
    } catch {
        throw new LookupError(`Clanker API returned invalid JSON for ${path}`);
    }
}

function normalizeUser(user) {
    if (!Number.isSafeInteger(user?.fid)) return null;
    const xAccount = Array.isArray(user.verified_accounts)
        ? user.verified_accounts.find((account) => account?.platform === 'x')
        : null;
    const addresses = user.verified_addresses?.eth_addresses;
    return {
        fid: user.fid,
        username: typeof user.username === 'string' ? user.username : null,
        followerCount: Number.isFinite(user.follower_count) ? user.follower_count : null,
        xHandle: safeXHandle(xAccount?.username),
        ethAddresses: Array.isArray(addresses)
            ? addresses.filter((address) => typeof address === 'string').map((address) => address.toLowerCase())
            : []
    };
}

function lookup(key, path) {
    return cached(key, async () => normalizeUser(await fetchUser(path)));
}

/** The Farcaster account that has verified this wallet, or null. Throws LookupError. */
function getUserByAddress(address) {
    return lookup(`address:${address.toLowerCase()}`, `/get-user-by-address?address=${encodeURIComponent(address)}`);
}

/** The Farcaster account with this FID, or null. Throws LookupError. */
function getUserByFid(fid) {
    return lookup(`fid:${fid}`, `/get-user-by-fid?fid=${encodeURIComponent(fid)}`);
}

module.exports = { LookupError, getUserByAddress, getUserByFid, normalizeUser };
