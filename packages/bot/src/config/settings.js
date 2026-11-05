/**
 * Application settings. Secrets and Discord IDs live in the environment;
 * everything here is safe to commit.
 * @module settings
 */

const settings = {
    /** Pinged when a verified deployer's FID is below `below`. */
    fidTiers: [
        { below: 1000, role: 'FID_BELOW_1000_ROLE', emoji: '🔥', color: '#00ff00' },
        { below: 5000, role: 'FID_BELOW_5000_ROLE', emoji: '👀', color: '#00dd00' },
        { below: 10000, role: 'FID_BELOW_10000_ROLE', emoji: '📊', color: '#00bb00' }
    ],

    /** Pinged when a verified deployer has at least `over` followers. Ascending order. */
    followerTiers: [
        { over: 5000, role: 'FOLLOWERS_OVER_5000_ROLE', emoji: '📈', color: '#550055' },
        { over: 10000, role: 'FOLLOWERS_OVER_10000_ROLE', emoji: '✨', color: '#770077' },
        { over: 20000, role: 'FOLLOWERS_OVER_20000_ROLE', emoji: '⭐', color: '#990099' },
        { over: 50000, role: 'FOLLOWERS_OVER_50000_ROLE', emoji: '💫', color: '#bb00bb' },
        { over: 100000, role: 'FOLLOWERS_OVER_100000_ROLE', emoji: '🚀', color: '#dd00dd' },
        { over: 200000, role: 'FOLLOWERS_OVER_200000_ROLE', emoji: '🌟', color: '#ff00ff' }
    ],

    /**
     * Deployment platforms, matched case-insensitively on the token's `interface`.
     *
     * The interface is self-reported, so anyone can claim to be any platform. A
     * platform role is only pinged when the deployer is listed in `deployers`;
     * otherwise the token is labelled as self-reported and nobody is pinged.
     */
    platforms: [
        { key: 'bankr', label: 'Bankr', interfaces: ['bankr'], role: 'BANKR_DEPLOYER_ROLE', emoji: '💰', color: '#00cc66', deployers: [] }
    ],

    /**
     * Wallets Clanker vets to deploy on behalf of users, so their social context
     * can be trusted without a wallet match. From Clanker's "Verifying Social
     * Context" docs. Clanker notes this list can change, so review it occasionally.
     */
    trustedDeployers: [
        '0x2112b8456AC07c15fA31ddf3Bf713E77716fF3F9',
        '0xB2C90e2bB032349e7bEc82B37Cdcc93b6B91036a',
        '0x8da62A828b0D9f1B33F75652605e12ee4E5e4F06',
        '0x002F07B0D63e8ac14F8ef6B73Ccd8caF1FeF074c',
        '0xC204af95b0307162118f7Bc36a91c9717490AB69',
        '0xd9aCd656A5f1B519C9E76a2A6092265A74186e58',
        '0xdd6494902709C8D7DfFf3daca21cF067271f22F8',
        '0xdc7D0Ea3B64E0c74488faF6B2BDc927B875Cd3f2',
        '0x21C78a0350fa50E7c79C761003e33C0c7F440185',
        '0x5E2B5027742aE08C1A018144e31f101f24Dc9824',
        '0x72469D86A92f5A9E975fE371a66015E667ab288f',
        '0x8865910d6ca985782Dc9CC521d23a10100fC800B',
        '0xE0c959EeDcFD004952441Ea4FB4B8f5af424e74B',
        '0x24D514Bc8eF5649A367d9c209b3AF16b0f177026',
        '0x9844050f249604F4485aeD2fC51BAAb3DBe78411',
        '0x26D0A510553C209a584E01Bd4551bDbe38151Fd4', // bracky
        '0xBD01E8106a169687C8572672c8900760E5BA170f' // AutoBoy
    ],

    /** FIDs to skip notifications for */
    skippedFids: [880, 6622, 306175],

    /** Which deployments get posted. Only proven identities ever ping anyone. */
    notify: {
        /** No identity from any source. Most deployments, so off by default. */
        anonymous: false,
        /** The deployer's wallet has a forward-verified Basename, but no social account. */
        namedWallets: true,
        /** X (Twitter) deployments. Posted without pings; there are no X roles. */
        x: true,
        /**
         * Claims or links that can't be proven: a social account in the token's
         * context, or an admin or fee wallet belonging to someone other than the
         * deployer. Posted with a warning.
         */
        unverifiedClaims: true,
        /** Claims a known platform from an unlisted deployer. Posted with a warning. */
        selfReportedPlatforms: true,
        /** Verified Farcaster accounts with no followers. */
        zeroFollowerAccounts: false
    },

    features: {
        displayImages: true
    },

    /** Defaults for each chain's watcher. Block ranges are set per chain in chains.js. */
    watcher: {
        /** How often to sweep for logs the WebSocket missed. */
        reconcileIntervalMs: 30_000,
        /** Stay this far behind head when sweeping, so a lagging node can't skip a block. */
        confirmationBlocks: 2,
        /** Pause between catch-up calls, to stay under the provider's rate limit. */
        catchupPauseMs: 250,
        wsPingIntervalMs: 30_000,
        wsMaxBackoffMs: 60_000
    },

    heartbeatIntervalMs: 15 * 60_000
};

for (const tier of settings.fidTiers) {
    if (!(tier.below > 0)) throw new Error(`Invalid FID tier: ${tier.role}`);
}
for (const tier of settings.followerTiers) {
    if (!(tier.over > 0)) throw new Error(`Invalid follower tier: ${tier.role}`);
}

module.exports = settings;
