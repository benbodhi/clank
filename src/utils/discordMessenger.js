const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { resolveNames } = require('./nameResolver');
const { handleError } = require('./errorHandler');

async function sendDiscordMessage(tokenData, eventLog, discord, provider) {
    try {
        const channel = await getDiscordChannel(discord);
        if (!channel) return;

        const embed = await createEmbed(tokenData, provider);
        const messageContent = createMessageContent(tokenData);

        await channel.send({
            content: messageContent,
            embeds: [embed]
        });
    } catch (error) {
        handleError(error, 'Discord Message');
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
    const resolvedName = await resolveNames(tokenData.deployer, provider);
    const deployerField = formatDeployerField(resolvedName, tokenData.deployer);
    const uniswapTradeLink = createUniswapTradeLink(tokenData.tokenAddress);
    const photonLink = tokenData.poolAddress ? 
        `| **[Photon](https://photon-base.tinyastro.io/en/lp/${tokenData.poolAddress})**` : 
        '';

    return new EmbedBuilder()
        .setColor(Number(tokenData.fid) < config.fidThreshold ? '#00de34' : '#0099ff')
        .setTitle('🔔 New Token Created!')
        .addFields(createEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink))
        .setTimestamp();
}

function createMessageContent(tokenData) {
    if (Number(tokenData.fid) < config.fidThreshold) {
        return `**<@&${process.env.LOW_FID_ROLE}> 👀**\n**FID: ${tokenData.fid}**`;
    }
    return '';
}

function formatDeployerField(resolvedName, deployer) {
    return resolvedName ? 
        `${resolvedName} ([${deployer}](https://basescan.org/address/${deployer}))` : 
        `[${deployer}](https://basescan.org/address/${deployer})`;
}

function createUniswapTradeLink(tokenAddress) {
    return `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${tokenAddress}&chain=base`;
}

function createEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink) {
    return [
        { name: 'Token Name', value: tokenData.name, inline: true },
        { name: 'Ticker', value: tokenData.symbol, inline: true },
        { 
            name: 'Contract Address', 
            value: `${tokenData.tokenAddress}\n**[Basescan](https://basescan.org/token/${tokenData.tokenAddress})** | **[Dexscreener](https://dexscreener.com/base/${tokenData.tokenAddress})** | **[Uniswap](${uniswapTradeLink})** ${photonLink}`, 
            inline: false 
        },
        { name: 'Deployer', value: deployerField, inline: false },
        { name: 'FID', value: `[${tokenData.fid}](https://warpcast.com/~/profiles/${tokenData.fid})`, inline: false },
        { name: 'Cast', value: `[View Launch Cast](https://warpcast.com/~/conversations/${tokenData.castHash})`, inline: false },
        { name: 'Supply', value: tokenData.supply, inline: false },
        { name: 'LP Position', value: `[NFT ID: ${tokenData.lpNftId}](https://app.uniswap.org/#/pool/${tokenData.lpNftId})`, inline: false }
    ];
}

module.exports = { sendDiscordMessage }; 