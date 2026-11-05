const { settings } = require('../config');
const { decodeLaunchLog, fetchFeeRecipients, fetchV5Details, parseContext } = require('../contracts/launchDecoder');
const { getBasename } = require('../services/basenames');
const { LookupError, getUserByAddress, getUserByFid } = require('../services/clankerApi');
const { noStore } = require('../services/launchStore');
const { buildMessage } = require('../utils/discordMessenger');
const { withRetries } = require('../utils/retry');
const { cleanText, safeImageUrl, safeXHandle, safeXPostUrl, xHandleFromPostUrl } = require('../utils/sanitize');
const logger = require('../utils/logger');

const VETTED_DEPLOYERS = new Set(settings.trustedDeployers.map((address) => address.toLowerCase()));
const FID_PATTERN = /^[1-9]\d{0,11}$/;
const MAX_LINKED_WALLET_LOOKUPS = 4;

function matchPlatform(interfaceName, deployer, deployerIsSigner) {
    const name = interfaceName.toLowerCase();
    const platform = settings.platforms.find((candidate) => candidate.interfaces.includes(name));
    if (!platform) return null;
    const listed = platform.deployers.some((address) => address.toLowerCase() === deployer.toLowerCase());
    return { ...platform, trusted: deployerIsSigner && listed };
}

function readClaim(context) {
    if (context.platform === 'farcaster' && FID_PATTERN.test(context.id)) {
        return { kind: 'farcaster', fid: Number(context.id), castHash: context.messageId };
    }
    if (context.platform === 'x' || context.platform === 'twitter') {
        // The on-chain context usually has only the post's URL, not a username.
        const postUrl = safeXPostUrl(context.messageId);
        const handle = safeXHandle(context.username) ?? xHandleFromPostUrl(context.messageId);
        if (handle || postUrl) return { kind: 'x', handle, postUrl };
    }
    return null;
}

function verifiedFarcaster(profile, fid, proof, claim) {
    return {
        kind: 'farcaster',
        verified: true,
        proof,
        fid,
        profile,
        castHash: claim?.kind === 'farcaster' && claim.fid === fid ? claim.castHash : null,
        conflictingClaim: claim?.kind === 'farcaster' && claim.fid !== fid ? claim.fid : null
    };
}

/**
 * Works out who's behind a launch, from the strongest evidence available.
 *
 * Proven, and allowed to ping roles, but only if the deployer really made the call:
 *   1. A Clanker-vetted deployer, which vouches for the token's social context.
 *   2. The wallet that launched the token, if a Farcaster account verified it. This
 *      needs no social context, so it also identifies direct deployments.
 *
 * Not proven, so shown with a warning and never pinged:
 *   3. An admin or fee wallet belonging to a known account. The deployer sets these
 *      freely, for example naming a well-known wallet to borrow its credibility.
 *   4. A social account named in the context. Anyone can claim any account.
 */
async function resolveIdentity({ claim, deployer, deployerIsSigner, wallets }, services) {
    const signer = deployer.toLowerCase();

    if (deployerIsSigner && VETTED_DEPLOYERS.has(signer)) {
        if (claim?.kind === 'farcaster') {
            return verifiedFarcaster(await services.getUserByFid(claim.fid), claim.fid, 'vetted', claim);
        }
        if (claim?.kind === 'x') return { ...claim, verified: true };
    } else if (deployerIsSigner) {
        const signerUser = await services.getUserByAddress(deployer);
        if (signerUser) return verifiedFarcaster(signerUser, signerUser.fid, 'wallet', claim);

        // A wallet can be verified on several accounts, and the lookup returns one.
        if (claim?.kind === 'farcaster') {
            const claimed = await services.getUserByFid(claim.fid);
            if (claimed?.ethAddresses.includes(signer)) return verifiedFarcaster(claimed, claim.fid, 'wallet', claim);
        }
    }

    for (const { wallet, role } of wallets.slice(0, MAX_LINKED_WALLET_LOOKUPS)) {
        if (deployerIsSigner && wallet.toLowerCase() === signer) continue;
        const profile = await services.getUserByAddress(wallet);
        if (profile) return { kind: 'linked', verified: false, fid: profile.fid, profile, wallet, role };
    }

    if (claim) return { ...claim, verified: false };
    return { kind: 'none', verified: false };
}

/** Returns why a launch shouldn't be posted, or null if it should. */
function skipReason({ identity, platform, deployerName }) {
    const { notify, skippedFids } = settings;

    if (platform?.trusted) return null;
    if (identity.fid && skippedFids.includes(identity.fid)) return 'skipped FID';

    switch (identity.kind) {
        case 'farcaster':
            if (!identity.verified) return notify.unverifiedClaims ? null : 'unverified claim';
            return identity.profile?.followerCount === 0 && !notify.zeroFollowerAccounts ? 'zero followers' : null;
        case 'x':
            if (!notify.x) return 'X deployments disabled';
            return identity.verified || notify.unverifiedClaims ? null : 'unverified claim';
        case 'linked':
            return notify.unverifiedClaims ? null : 'unverified claim';
        default:
            if (platform) return notify.selfReportedPlatforms ? null : 'self-reported platform';
            if (deployerName) return notify.namedWallets ? null : 'named wallet';
            return notify.anonymous ? null : 'anonymous deployment';
    }
}

/** Flattens a resolved launch into the row the webapp reads. All text is cleaned. */
function toRecord({ chain, launch, context, identity, platform, deployerName, vetted, feeRecipients, reason }) {
    const actor = vetted && launch.creator ? launch.creator : launch.deployer;
    const profile = identity.profile;
    return {
        chain_id: chain.id,
        token_address: launch.tokenAddress,
        version: launch.version,
        tx_hash: launch.transactionHash,
        block_number: launch.blockNumber,
        launched_at: launch.launchedAt,
        name: cleanText(launch.name) || '(unnamed)',
        symbol: cleanText(launch.symbol, 40) || '?',
        image_url: safeImageUrl(launch.image),
        pool_id: launch.poolId,
        supply: launch.supply,
        buy_tax_percent: launch.buyTaxPercent,
        sell_tax_percent: launch.sellTaxPercent,
        deployer: launch.deployer,
        deployer_is_signer: launch.deployerIsSigner,
        deployer_vetted: vetted,
        deployer_name: deployerName,
        creator: launch.creator,
        actor: actor.toLowerCase(),
        fee_recipients: feeRecipients,
        interface: cleanText(context.interface, 40) || null,
        platform: platform?.label ?? null,
        platform_trusted: platform?.trusted ?? false,
        identity_kind: identity.kind,
        identity_verified: identity.verified,
        identity_proof: identity.proof,
        fid: identity.fid,
        farcaster_username: profile?.username ? cleanText(profile.username, 40) : null,
        follower_count: profile?.followerCount,
        x_handle: profile?.xHandle ?? identity.handle,
        x_post_url: identity.postUrl,
        cast_hash: identity.castHash && /^0x[0-9a-fA-F]{40}$/.test(identity.castHash) ? identity.castHash : null,
        linked_role: identity.role,
        linked_wallet: identity.wallet,
        conflicting_fid: identity.conflictingClaim,
        skip_reason: reason
    };
}

/** Fee data is a bonus, so a failed read costs that field, not the whole alert. */
async function loadFeeRecipients(launch, services) {
    try {
        return await services.fetchFeeRecipients(launch);
    } catch (error) {
        logger.warn(`Could not read fee recipients for ${launch.tokenAddress}: ${error.message}`);
        return [];
    }
}

/** Answers "unknown" instead of failing, so a long API outage can't block alerts. */
function tolerant(lookup) {
    return async (value) => {
        try {
            return await lookup(value);
        } catch (error) {
            if (error instanceof LookupError) return null;
            throw error;
        }
    };
}

function decode(rawLog, chain) {
    try {
        return decodeLaunchLog(rawLog, chain);
    } catch (error) {
        error.permanent = true; // the same bytes will never decode
        throw error;
    }
}

/**
 * Builds the handler for a chain's raw factory logs. It rejects only on failures worth
 * retrying (RPC, Discord, Clanker lookups). Every launch is stored for the webapp,
 * while `skipReason` only decides what goes to Discord. With no `send`, nothing is
 * posted (used by the backfill).
 */
function createLaunchHandler({ chain, provider, store = noStore, send, stats, webUrl = null, services: overrides }) {
    const services = {
        getUserByAddress,
        getUserByFid,
        getBasename: (address) => (chain.basenameResolver ? getBasename(address, provider, chain.basenameResolver) : null),
        getBlockTime: async (blockNumber) => new Date((await provider.getBlock(blockNumber)).timestamp * 1000),
        fetchDetails: (launch) => fetchV5Details(launch, provider, chain),
        fetchFeeRecipients: (launch) => fetchFeeRecipients(launch, provider, chain),
        ...overrides
    };

    return async function handleLaunchLog(rawLog, { tolerateLookupFailures = false } = {}) {
        const decoded = decode(rawLog, chain);
        if (!decoded) return;

        const lookups = tolerateLookupFailures
            ? { ...services, getUserByAddress: tolerant(services.getUserByAddress), getUserByFid: tolerant(services.getUserByFid) }
            : services;

        const launch = decoded.version === 'v5'
            ? { ...decoded, ...await services.fetchDetails(decoded) }
            : decoded;
        launch.launchedAt ??= await services.getBlockTime(launch.blockNumber);

        const context = parseContext(launch.rawContext);
        const claim = readClaim(context);
        const platform = matchPlatform(context.interface, launch.deployer, launch.deployerIsSigner);
        const feeRecipients = await loadFeeRecipients(launch, services);
        const wallets = [
            ...(launch.creator ? [{ wallet: launch.creator, role: 'admin' }] : []),
            ...feeRecipients.map(({ wallet }) => ({ wallet, role: 'fee recipient' }))
        ];

        const identity = await resolveIdentity(
            { claim, deployer: launch.deployer, deployerIsSigner: launch.deployerIsSigner, wallets },
            lookups
        );

        const vetted = launch.deployerIsSigner && VETTED_DEPLOYERS.has(launch.deployer.toLowerCase());
        const deployerName = vetted || !launch.deployerIsSigner ? null : await services.getBasename(launch.deployer);

        const label = `${chain.name} ${launch.version} ${cleanText(launch.name, 40)} (${cleanText(launch.symbol, 20)}) ${launch.tokenAddress}`;
        const reason = skipReason({ identity, platform, deployerName });
        const record = toRecord({ chain, launch, context, identity, platform, deployerName, vetted, feeRecipients, reason });
        const { alreadyPosted } = await store.saveLaunch(record);

        if (reason) {
            stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
            logger.info(`Skipped ${label}: ${reason}`);
            return;
        }
        if (alreadyPosted || !send) return;

        await send(buildMessage({ chain, launch, identity, platform, deployerName, vetted, feeRecipients, webUrl }));
        await store.markPosted(record);
        stats.posted++;
        logger.info(`Posted ${label}`);
    };
}

/**
 * Handles a log with retries. If Clanker's API stays down, it goes ahead without
 * lookups: a late, less detailed alert beats none. Only the Farcaster lookups degrade.
 */
async function handleWithRetries(handle, rawLog, stats, { delaysMs } = {}) {
    try {
        await withRetries(() => handle(rawLog), { label: `Log ${rawLog.transactionHash}`, delaysMs });
    } catch (error) {
        if (!(error instanceof LookupError)) throw error;
        stats.degraded = (stats.degraded ?? 0) + 1;
        logger.warn(`Handling ${rawLog.transactionHash} without identity lookups: ${error.message}`);
        await handle(rawLog, { tolerateLookupFailures: true });
    }
}

module.exports = { createLaunchHandler, handleWithRetries, resolveIdentity, skipReason, readClaim, toRecord };
