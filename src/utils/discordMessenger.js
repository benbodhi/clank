const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { resolveNames } = require('../services/nameResolver');
const { getWarpcastUserData } = require('../services/warpcastResolver');
const { handleError } = require('../handlers/errorHandler');

/**
 * Sends a Discord message with token creation details
 * @param {Object} tokenData - Token creation data
 * @param {Object} eventLog - Event log data
 * @param {Discord.Client} discord - Discord client instance
 * @param {ethers.Provider} provider - Ethers provider instance
 */
async function sendDiscordMessage(tokenData, eventLog, discord, provider) {
    try {
        const channel = await getDiscordChannel(discord);
        if (!channel) return;

        const embed = await createEmbed(tokenData, provider);
        const content = createMessageContent(tokenData);
        
        await channel.send({ 
            content,
            embeds: [embed] 
        });
    } catch (error) {
        handleError(error, 'Discord Message Sending');
    }
}

async function getDiscordChannel(discord) {
    const channel = await discord.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
        console.error('❌ Could not find Discord channel');
        return null;
    }
    return channel;
}

async function createEmbed(tokenData, provider) {
    try {
        const resolvedName = await resolveNames(tokenData.deployer, provider);
        const warpcastData = await getWarpcastUserData(tokenData.fid);
        const deployerField = formatDeployerField(resolvedName, tokenData.deployer);
        const uniswapTradeLink = createUniswapTradeLink(tokenData.tokenAddress);
        const photonLink = tokenData.poolAddress ? 
            `| **[Photon](https://photon-base.tinyastro.io/en/lp/${tokenData.poolAddress})**` : 
            '';

        return new EmbedBuilder()
            .setColor(Number(tokenData.fid) < config.fidThreshold ? '#00de34' : '#0099ff')
            .setTitle('🔔 Clank Clank!')
            .addFields(
                ...createEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink, warpcastData)
            )
            .setTimestamp();
    } catch (error) {
        handleError(error, 'Discord Embed Creation');
        throw error;
    }
}

function createMessageContent(tokenData) {
    if (Number(tokenData.fid) < config.fidThreshold) {
        return `**<@&${process.env.LOW_FID_ROLE}> 👀**\n**FID: ${tokenData.fid}**`;
    }
    return '';
}

function formatDeployerField(resolvedName, address) {
    const lines = [];
    
    if (resolvedName.basename) {
        lines.push(resolvedName.basename);
    }
    
    if (resolvedName.ensName) {
        lines.push(resolvedName.ensName);
    }
    
    lines.push(resolvedName.address);
    lines.push(`**[Basescan](https://basescan.org/address/${address})** | **[Etherscan](https://etherscan.io/address/${address})**`);
    
    return lines.join('\n');
}

function createUniswapTradeLink(tokenAddress) {
    return `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${tokenAddress}&chain=base`;
}

function createEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink, warpcastData) {
    const farcasterValue = warpcastData ? 
        `${tokenData.fid} | **[${warpcastData.username}](https://warpcast.com/~/profiles/${tokenData.fid})** | ${warpcastData.followerCount.toLocaleString()} followers` :
        `${tokenData.fid}`;

    const fields = [
        { name: 'Token Name', value: tokenData.name, inline: true },
        { name: 'Ticker', value: tokenData.symbol, inline: true },
        { 
            name: 'Contract Address', 
            value: `${tokenData.tokenAddress}\n**[Basescan](https://basescan.org/token/${tokenData.tokenAddress})** | **[Dexscreener](https://dexscreener.com/base/${tokenData.tokenAddress})** | **[Uniswap](${uniswapTradeLink})** ${photonLink}`, 
            inline: false 
        },
        { name: 'Deployer', value: deployerField, inline: false },
        { name: 'FID', value: farcasterValue, inline: false },
        { name: 'Cast', value: `**[View Launch Cast](https://warpcast.com/~/conversations/${tokenData.castHash})**`, inline: false },
        { name: 'Supply', value: tokenData.supply, inline: false },
        { name: 'LP Position', value: `**[NFT ID: ${tokenData.lpNftId}](https://app.uniswap.org/#/pool/${tokenData.lpNftId})**`, inline: false }
    ];

    return fields;
}

module.exports = { sendDiscordMessage }; 