const settings = require('./settings');

const SNOWFLAKE = /^\d{17,20}$/;

/** Reads a Discord ID from the environment, or null if it's unset or malformed. */
function discordId(name) {
    const value = process.env[name]?.trim();
    return value && SNOWFLAKE.test(value) ? value : null;
}

/** A public https URL for links, or null. */
function httpsUrl(name) {
    const value = process.env[name]?.trim();
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.origin : null;
    } catch {
        return null;
    }
}

/** Validates the environment, throwing a message that names only the variables. */
function loadEnv({ requireDiscord = true } = {}) {
    const required = ['ALCHEMY_API_KEY', ...(requireDiscord ? ['DISCORD_TOKEN', 'DISCORD_CLANKER_CHANNEL_ID'] : [])];
    const missing = required.filter((name) => !process.env[name]?.trim());
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    const channelId = discordId('DISCORD_CLANKER_CHANNEL_ID');
    if (requireDiscord && !channelId) {
        throw new Error('DISCORD_CLANKER_CHANNEL_ID is not a valid Discord ID');
    }

    return {
        alchemyApiKey: process.env.ALCHEMY_API_KEY.trim(),
        discordToken: process.env.DISCORD_TOKEN?.trim(),
        channelId,
        databaseUrl: process.env.DATABASE_URL?.trim() || null,
        webUrl: httpsUrl('WEB_URL'),
        dryRun: process.env.DRY_RUN === 'true',
        stateFile: process.env.STATE_FILE?.trim() || 'data/state.json'
    };
}

/** Every role name the bot can ping, for the startup check. */
function allRoleNames() {
    return [
        ...settings.fidTiers.map((tier) => tier.role),
        ...settings.followerTiers.map((tier) => tier.role),
        ...settings.platforms.map((platform) => platform.role)
    ];
}

module.exports = { settings, loadEnv, discordId, allRoleNames };
