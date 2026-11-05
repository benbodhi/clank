const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { settings, discordId, allRoleNames } = require('../config');
const {
    cleanText,
    displayText,
    safeCastHash,
    safeImageUrl
} = require('./sanitize');
const logger = require('./logger');

const DEFAULT_COLOR = '#0099ff';
const UNVERIFIED_COLOR = '#808080';
const MAX_FEE_RECIPIENTS = 3;

/** The roles to ping and their display lines. Empty unless the source is verified. */
function selectRoles({ identity, platform }) {
    const tiers = [];

    if (platform?.trusted) {
        tiers.push(platform);
    } else if (identity.kind === 'farcaster' && identity.verified) {
        tiers.push(...settings.fidTiers.filter((tier) => identity.fid < tier.below));
        const followers = identity.profile?.followerCount ?? 0;
        tiers.push(...settings.followerTiers.filter((tier) => followers >= tier.over));
    }

    return tiers
        .map((tier) => ({ id: discordId(tier.role), emoji: tier.emoji }))
        .filter((role) => role.id);
}

function buildContent({ identity, platform }, roles) {
    if (!roles.length) return '';
    const lines = roles.map((role) => `**<@&${role.id}> ${role.emoji}**`);

    if (platform?.trusted) {
        lines.push(`**${platform.label} Deployment**`);
    } else {
        const followers = identity.profile?.followerCount;
        const followerText = followers === null || followers === undefined ? 'unknown' : followers.toLocaleString('en-US');
        lines.push(`**FID: ${identity.fid.toLocaleString('en-US')} | Followers: ${followerText}**`);
    }
    return lines.join('\n');
}

function selectColor({ identity, platform }) {
    if (platform?.trusted) return platform.color;
    if (!identity.verified) return identity.kind === 'none' && !platform ? DEFAULT_COLOR : UNVERIFIED_COLOR;
    if (identity.kind !== 'farcaster') return DEFAULT_COLOR;

    // Follower tiers take priority over FID tiers, and the highest tier wins.
    const followers = identity.profile?.followerCount ?? 0;
    const followerTier = settings.followerTiers.findLast((tier) => followers >= tier.over);
    const fidTier = settings.fidTiers.find((tier) => identity.fid < tier.below);
    return followerTier?.color ?? fidTier?.color ?? DEFAULT_COLOR;
}

function linkLine(links) {
    return links.map(([label, url]) => `**[${label}](${url})**`).join(' | ');
}

function profileLink(profile, fid) {
    const name = profile?.username ? displayText(profile.username, 40) : `FID ${fid}`;
    return `**[${name}](https://farcaster.xyz/~/profiles/${fid})**`;
}

function xLink(handle, postUrl) {
    const text = handle ? displayText(`@${handle}`, 20) : 'View post';
    const url = postUrl ?? (handle ? `https://x.com/${handle}` : null);
    return url ? `**[${text}](${url})**` : text;
}

function verifiedFarcasterFields({ fid, profile, castHash, proof, conflictingClaim }) {
    const parts = [`${fid}`, profileLink(profile, fid)];
    if (Number.isFinite(profile?.followerCount)) {
        parts.push(`${profile.followerCount.toLocaleString('en-US')} followers`);
    }
    if (profile?.xHandle) parts.push(xLink(profile.xHandle));

    const fields = [{
        name: 'FID',
        value: `${parts.join(' | ')}\n${proof === 'wallet' ? 'Verified: signed by this account\'s wallet' : 'Verified: vetted by Clanker'}`
    }];

    const cast = safeCastHash(castHash);
    if (cast) {
        fields.push({
            name: 'Cast',
            value: `**[View Launch Cast](https://farcaster.xyz/~/conversations/${cast})**`
        });
    }
    if (conflictingClaim) {
        fields.push({
            name: '⚠️ Conflicting claim',
            value: `The token also claims FID ${conflictingClaim}, which doesn't match the deployer.`
        });
    }
    return fields;
}

function identityFields({ identity }) {
    switch (identity.kind) {
        case 'farcaster':
            if (identity.verified) return verifiedFarcasterFields(identity);
            return [{
                name: '⚠️ Unverified Farcaster claim',
                value: `Claims FID ${identity.fid}, but the deployer isn't verified for that account. Anyone can claim any FID.`
            }];
        case 'x': {
            const value = xLink(identity.handle, identity.postUrl);
            if (identity.verified) return [{ name: 'X', value }];
            return [{
                name: '⚠️ Unverified X claim',
                value: `${value}\nThe deployer can't be tied to this account. Anyone can claim any handle.`
            }];
        }
        case 'linked':
            return [{
                name: `⚠️ Unproven link: ${identity.role}`,
                value: `${profileLink(identity.profile, identity.fid)} owns the ${identity.role} wallet, but someone else deployed this token. A deployer can name any wallet without its owner's consent.`
            }];
        default:
            return [];
    }
}

function platformFields({ platform }) {
    if (!platform) return [];
    return platform.trusted
        ? [{ name: 'Platform', value: platform.label }]
        : [{ name: '⚠️ Self-reported platform', value: `Claims ${platform.label}, from a deployer not on the known list.` }];
}

function addressField(chain, name, address, note) {
    const links = linkLine([
        [chain.explorer.name, `${chain.explorer.url}/address/${address}`],
        ...chain.walletLinks(address)
    ]);
    return { name, value: [note, address, links].filter(Boolean).join('\n') };
}

function deployerField(chain, { deployer, deployerIsSigner }, { vetted, deployerName }) {
    if (vetted) return addressField(chain, 'Deployer', deployer, 'Clanker-vetted wallet, deploying for the creator');
    if (!deployerIsSigner) return addressField(chain, 'Sent By', deployer, 'Launched through another contract, so this proves nothing');
    return addressField(chain, 'Deployer', deployer, deployerName ? displayText(deployerName, 80) : null);
}

function feeField(chain, recipients) {
    if (!recipients.length) return [];
    const shown = recipients.slice(0, MAX_FEE_RECIPIENTS).map(({ wallet, bps }) =>
        `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}% [${wallet}](${chain.explorer.url}/address/${wallet})`);
    const hidden = recipients.length - shown.length;
    if (hidden > 0) shown.push(`and ${hidden} more`);
    return [{ name: 'Fee Recipients', value: shown.join('\n') }];
}

/** Builds a complete Discord message for a launch. Pure, so it's testable offline. */
function buildMessage({ chain, launch, identity, platform, deployerName = null, vetted = false, feeRecipients = [], webUrl = null }) {
    const { tokenAddress, poolId, deployer, creator } = launch;
    const roles = selectRoles({ identity, platform });

    const researchLinks = [
        [chain.explorer.name, `${chain.explorer.url}/token/${tokenAddress}`],
        ...chain.researchLinks(tokenAddress, poolId)
    ];
    const tradeLinks = [
        ...chain.tradeLinks(tokenAddress),
        ...(webUrl ? [['Vet on Clank', `${webUrl}/token/${chain.key}/${tokenAddress}`]] : [])
    ];

    const fields = [
        { name: 'Token Name', value: displayText(launch.name), inline: true },
        { name: 'Ticker', value: displayText(launch.symbol, 40), inline: true },
        { name: 'Version', value: chain.key === 'base' ? launch.version : `${launch.version} on ${chain.name}`, inline: true },
        { name: 'Contract Address', value: `${tokenAddress}\n${linkLine(researchLinks)}\n${linkLine(tradeLinks)}` },
        deployerField(chain, launch, { vetted, deployerName })
    ];

    if (creator && creator.toLowerCase() !== deployer.toLowerCase()) {
        fields.push(addressField(chain, vetted ? 'Creator Wallet' : 'Token Admin', creator));
    }
    fields.push(
        ...platformFields({ platform }),
        ...identityFields({ identity }),
        ...feeField(chain, feeRecipients),
        ...(Number.isFinite(launch.buyTaxPercent)
            ? [{ name: 'Tax', value: `${launch.buyTaxPercent}% buy / ${launch.sellTaxPercent}% sell` }]
            : []),
        { name: 'Total Supply', value: launch.supply }
    );

    const embed = new EmbedBuilder()
        .setColor(selectColor({ identity, platform }))
        .setTitle('🚀 New Clanker Token Deployed')
        .addFields(fields)
        .setTimestamp();

    const image = settings.features.displayImages ? safeImageUrl(launch.image) : null;
    if (image) embed.setImage(image);

    return {
        content: buildContent({ identity, platform }, roles),
        embeds: [embed],
        // Only the roles chosen above can ever be pinged, whatever the text contains.
        allowedMentions: { parse: [], roles: roles.map((role) => role.id) }
    };
}

/** Fails fast on a bad channel or missing permissions, and warns about role setup. */
async function verifyChannelAccess(client, channelId, { dryRun }) {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !channel.guild) {
        throw new Error('DISCORD_CLANKER_CHANNEL_ID is not a server text channel');
    }

    const me = await channel.guild.members.fetchMe();
    const permissions = channel.permissionsFor(me);
    const missing = permissions.missing([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ]);
    if (missing.length) {
        const message = `Missing channel permissions: ${missing.join(', ')}`;
        if (!dryRun) throw new Error(message);
        logger.warn(message);
    }

    const roles = await channel.guild.roles.fetch();
    const canMentionAny = permissions.has(PermissionFlagsBits.MentionEveryone);
    for (const name of allRoleNames()) {
        const id = discordId(name);
        const role = id && roles.get(id);
        if (!id) logger.warn(`${name} is not set, so that role won't be pinged`);
        else if (!role) logger.warn(`${name} doesn't match a role in this server`);
        else if (!role.mentionable && !canMentionAny) {
            logger.warn(`${name} (${cleanText(role.name, 40)}) can't be pinged: make it mentionable or grant Mention Everyone`);
        }
    }

    return channel;
}

module.exports = { buildMessage, selectRoles, verifyChannelAccess };
