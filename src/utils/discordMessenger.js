const { EmbedBuilder } = require('discord.js');
const { settings } = require('../config');
const { getWarpcastUserData } = require('../services/warpcastResolver');
const { handleError } = require('../handlers/errorHandler');
const { ethers, formatUnits } = require('ethers');
const logger = require('./logger');

// Utility Functions
function formatDeployerField(address) {
    try {
        const checksummedAddress = ethers.getAddress(address);
        return `${checksummedAddress}\n**[Basescan](https://basescan.org/address/${address})** | **[Etherscan](https://etherscan.io/address/${address})**`;
    } catch (error) {
        handleError(error, 'Address Formatting');
        return `${address}\n**[Basescan](https://basescan.org/address/${address})** | **[Etherscan](https://etherscan.io/address/${address})**`;
    }
}

function createUniswapTradeLink(tokenAddress) {
    return `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${tokenAddress}&chain=base`;
}

// Utility function to check deployment platform
function getDeploymentPlatform(castHash) {
    if (!castHash) return 'standard';
    const hash = castHash.toLowerCase();
    if (hash.includes('clank.fun')) return 'clankfun';
    if (hash.includes('bolide')) return 'bolide';
    return 'standard';
}

// Clanker-specific Functions
function createClankerEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink, warpcastData) {
    const platform = getDeploymentPlatform(tokenData.castHash);
    const farcasterValue = warpcastData ? 
        `${tokenData.fid} | **[${warpcastData.username}](https://warpcast.com/~/profiles/${tokenData.fid})** | ${warpcastData.followerCount.toLocaleString()} followers` :
        `${tokenData.fid}`;

    const clankFunLink = `**[Clank.fun](https://clank.fun/t/${tokenData.tokenAddress})**`;
    const geckoTerminalLink = tokenData.poolAddress ? 
        `**[GeckoTerminal](https://www.geckoterminal.com/base/pools/${tokenData.poolAddress})**` : '';
    const photonLinkClean = tokenData.poolAddress ? 
        `**[Photon](https://photon-base.tinyastro.io/en/lp/${tokenData.poolAddress})**` : '';

    const firstLineLinks = [
        `**[Basescan](https://basescan.org/token/${tokenData.tokenAddress})**`,
        `**[Dexscreener](https://dexscreener.com/base/${tokenData.tokenAddress})**`,
        geckoTerminalLink
    ].filter(Boolean).join(' | ');

    const secondLineLinks = [
        photonLinkClean,
        `**[Uniswap](${uniswapTradeLink})**`,
        clankFunLink
    ].filter(Boolean).join(' | ');

    const fields = [
        { name: 'Token Name', value: tokenData.name, inline: true },
        { name: 'Ticker', value: tokenData.symbol, inline: true },
        { 
            name: 'Contract Address', 
            value: `${tokenData.tokenAddress}\n${firstLineLinks}\n${secondLineLinks}`, 
            inline: false 
        },
        { name: 'Deployer', value: deployerField, inline: false }
    ];

    // Only add FID and Cast field if standard deployment
    if (platform === 'standard') {
        fields.push({ 
            name: 'FID', 
            value: farcasterValue, 
            inline: false 
        });
        fields.push({ 
            name: 'Cast', 
            value: `**[View Launch Cast](https://warpcast.com/~/conversations/${tokenData.castHash})**`, 
            inline: false 
        });
    }

    fields.push(
        { name: 'Total Supply', value: tokenData.totalSupply, inline: false },
        { 
            name: 'LP Position', 
            value: `**[${tokenData.positionId}](https://app.uniswap.org/positions/v3/base/${tokenData.positionId})**`, 
            inline: false 
        }
    );

    return fields;
}

function createClankerMessageContent(tokenData, warpcastData) {
    const messages = [];
    const platform = getDeploymentPlatform(tokenData.castHash);
    const fid = Number(tokenData.fid);
    const followers = warpcastData?.followerCount || 0;
    
    if (platform === 'clankfun') {
        messages.push(`**<@&${process.env.CLANKFUN_DEPLOYER_ROLE}> 🤖**`);
        messages.push(`**Clank.fun Deployment**`);
    } else if (platform === 'bolide') {
        messages.push(`**<@&${process.env.BOLIDE_DEPLOYER_ROLE}> 🟣**`);
        messages.push(`**Bolide Deployment**`);
    } else {
        // FID-based notifications
        if (fid < settings.fidThresholds.below1000) {
            messages.push(`**<@&${process.env.FID_BELOW_1000_ROLE}> 🔥**\n`);
            messages.push(`**<@&${process.env.FID_BELOW_5000_ROLE}> 👀**\n`);
            messages.push(`**<@&${process.env.FID_BELOW_10000_ROLE}> 📊**\n`);
        } else if (fid < settings.fidThresholds.below5000) {
            messages.push(`**<@&${process.env.FID_BELOW_5000_ROLE}> 👀**\n`);
            messages.push(`**<@&${process.env.FID_BELOW_10000_ROLE}> 📊**\n`);
        } else if (fid < settings.fidThresholds.below10000) {
            messages.push(`**<@&${process.env.FID_BELOW_10000_ROLE}> 📊**\n`);
        }
        
        // Follower threshold notifications
        if (followers >= settings.followerThresholds.over5000) {
            const thresholds = [5000, 10000, 20000, 50000, 100000, 200000];
            for (const threshold of thresholds) {
                if (followers >= threshold) {
                    messages.push(`**<@&${process.env[`FOLLOWERS_OVER_${threshold}_ROLE`]}> ${getFollowerEmoji(threshold)}**\n`);
                }
            }
        }
        
        // Add FID and follower info for standard deployments
        if (messages.length > 0) {
            messages.push(`**FID: ${fid.toLocaleString()} | Followers: ${followers.toLocaleString()}**`);
        }
    }
    
    return messages.join('\n');
}

function getFollowerEmoji(threshold) {
    const emojis = {
        5000: '📈',
        10000: '✨',
        20000: '⭐',
        50000: '💫',
        100000: '🚀',
        200000: '🌟'
    };
    return emojis[threshold] || '📈';
}

// Main Message Sending Functions
async function sendClankerMessage(tokenData, event, discord, timings = {}) {
    try {
        const messageStartTime = Date.now();
        
        const channel = await discord.channels.fetch(process.env.DISCORD_CLANKER_CHANNEL_ID);
        if (!channel) {
            throw new Error('Discord channel not found');
        }

        const deployerField = formatDeployerField(tokenData.deployer);
        const uniswapTradeLink = createUniswapTradeLink(tokenData.tokenAddress);
        const photonLink = tokenData.poolAddress ? 
            ` | **[Photon](https://photon-base.tinyastro.io/en/lp/${tokenData.poolAddress})**` : '';

        // Use the warpcastData that was passed in with tokenData
        const warpcastData = tokenData.warpcastData;

        // Check if it's a clank.fun deployment
        const isClankFun = tokenData.castHash?.toLowerCase().includes('clank.fun');

        const embed = new EmbedBuilder()
            .setColor(determineEmbedColor(isClankFun ? 0 : tokenData.fid, warpcastData?.followerCount))
            .setTitle('🚀 New Clanker Token Deployed')
            .addFields(createClankerEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink, warpcastData))
            .setTimestamp();

        if (tokenData.imageUrl) {
            embed.setImage(tokenData.imageUrl);
        }

        const content = createClankerMessageContent(tokenData, warpcastData);
        await channel.send({ content, embeds: [embed] });
        
        timings.discordSend = Date.now() - messageStartTime;
    } catch (error) {
        const isNetworkError = handleError(error, 'Discord Message');
        if (isNetworkError) throw error;
    }
}

function determineEmbedColor(fid, followers, platform) {
    // Platform-specific colors
    if (platform === 'clankfun') return '#ff9900'; // orange for clank.fun
    if (platform === 'bolide') return '#9933ff';   // purple for bolide

    // Check for clank.fun deployment (fid will be 0)
    if (fid === 0) {
        return '#ff9900'; // orange for clank.fun deployments
    }

    // Default blue
    let embedColor = '#0099ff';

    // FID colors (greens)
    if (fid < settings.fidThresholds.below1000) {
        embedColor = '#00ff00';
    } else if (fid < settings.fidThresholds.below5000) {
        embedColor = '#00dd00';
    } else if (fid < settings.fidThresholds.below10000) {
        embedColor = '#00bb00';
    }

    // Follower colors (purples) - override FID colors if higher threshold met
    if (followers >= settings.followerThresholds.over200000) {
        embedColor = '#ff00ff';
    } else if (followers >= settings.followerThresholds.over100000) {
        embedColor = '#dd00dd';
    } else if (followers >= settings.followerThresholds.over50000) {
        embedColor = '#bb00bb';
    } else if (followers >= settings.followerThresholds.over20000) {
        embedColor = '#990099';
    } else if (followers >= settings.followerThresholds.over10000) {
        embedColor = '#770077';
    } else if (followers >= settings.followerThresholds.over5000) {
        embedColor = '#550055';
    }

    return embedColor;
}

async function sendPresaleMessage(presaleData, event, discord, timings = {}) {
    const messageStartTime = Date.now();
    try {
        const channel = await discord.channels.fetch(process.env.DISCORD_CLANKER_CHANNEL_ID);
        if (!channel) {
            throw new Error('Discord channel not found');
        }

        // Fetch Warpcast data
        const warpcastStartTime = Date.now();
        const warpcastData = await getWarpcastUserData(presaleData.fid);
        timings.warpcastFetch = Date.now() - warpcastStartTime;

        const deployerField = formatDeployerField(presaleData.deployer);
        const isClankFun = presaleData.castHash?.toLowerCase().includes('clank.fun');

        // Create embed with yellow color
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🎯 New Clanker Presale')
            .addFields(createPresaleEmbedFields(presaleData, deployerField, warpcastData))
            .setTimestamp();

        // Create content for pings using existing logic
        const content = createPresaleMessageContent(presaleData, warpcastData);

        await channel.send({ content, embeds: [embed] });
        timings.discordSend = Date.now() - messageStartTime;

    } catch (error) {
        handleError(error, 'Presale Message Send');
        throw error;
    }
}

function createPresaleEmbedFields(presaleData, deployerField, warpcastData) {
    const isClankFun = presaleData.castHash?.toLowerCase().includes('clank.fun');
    const farcasterValue = warpcastData ? 
        `${presaleData.fid} | **[${warpcastData.username}](https://warpcast.com/~/profiles/${presaleData.fid})** | ${warpcastData.followerCount.toLocaleString()} followers` :
        `${presaleData.fid}`;

    // Calculate presale amounts
    const presaleTokenAmount = (Number(presaleData.bpsAvailable) / 10000) * Number(presaleData.totalSupply);
    const presaleEthPrice = Number(presaleData.ethPerBps);
    const presalePercentage = (Number(presaleData.bpsAvailable) / 100).toFixed(2);
    const totalPresaleEth = (Number(presaleData.bpsAvailable) * presaleEthPrice).toFixed(4);

    // Calculate example purchases
    const examplePurchases = [
        { eth: '0.01', percentage: '0.10' },
        { eth: '0.05', percentage: '0.50' },
        { eth: '0.10', percentage: '1.00' }
    ];

    const fields = [
        { name: 'Token Name', value: presaleData.name, inline: true },
        { name: 'Ticker', value: presaleData.symbol, inline: true },
        { 
            name: 'Presale Details', 
            value: [
                `• Total Supply: ${Number(presaleData.totalSupply).toLocaleString()} ${presaleData.symbol}`,
                `• Supply Available: ${presalePercentage}%`,
                `• Presale Goal: ${totalPresaleEth} ETH`,
                `• End: <t:${presaleData.endTime}:R>`,
                `**[View on Clanker World](https://www.clanker.world/presale/${presaleData.preSaleId})**`,
                `\n**Example Purchases:**`,
                ...examplePurchases.map(p => `• ${p.eth} ETH = ${p.percentage}% of supply`)
            ].join('\n'),
            inline: false 
        },
        { name: 'Deployer', value: deployerField, inline: false }
    ];

    if (!isClankFun) {
        fields.push({ 
            name: 'FID', 
            value: farcasterValue, 
            inline: false 
        });
        if (presaleData.castHash) {
            fields.push({ 
                name: 'Cast', 
                value: `**[View Launch Cast](https://warpcast.com/~/conversations/${presaleData.castHash})**`, 
                inline: false 
            });
        }
    }

    return fields;
}

function createPresaleMessageContent(presaleData, warpcastData) {
    const mentions = [];
    
    // Add role mentions based on FID and follower count
    if (presaleData.castHash?.toLowerCase().includes('clank.fun')) {
        mentions.push(`<@&${process.env.CLANKFUN_DEPLOYER_ROLE}>`);
    } else {
        // Add FID-based role mentions
        const fid = parseInt(presaleData.fid);
        if (fid < 1000) mentions.push(`<@&${process.env.FID_BELOW_1000_ROLE}>`);
        else if (fid < 5000) mentions.push(`<@&${process.env.FID_BELOW_5000_ROLE}>`);
        else if (fid < 10000) mentions.push(`<@&${process.env.FID_BELOW_10000_ROLE}>`);

        // Add follower-based role mentions
        if (warpcastData?.followerCount >= 100000) mentions.push(`<@&${process.env.FOLLOWERS_OVER_100000_ROLE}>`);
        else if (warpcastData?.followerCount >= 50000) mentions.push(`<@&${process.env.FOLLOWERS_OVER_50000_ROLE}>`);
        else if (warpcastData?.followerCount >= 20000) mentions.push(`<@&${process.env.FOLLOWERS_OVER_20000_ROLE}>`);
        else if (warpcastData?.followerCount >= 10000) mentions.push(`<@&${process.env.FOLLOWERS_OVER_10000_ROLE}>`);
        else if (warpcastData?.followerCount >= 5000) mentions.push(`<@&${process.env.FOLLOWERS_OVER_5000_ROLE}>`);
    }

    return mentions.length ? mentions.join(' ') : '';
}

async function sendPresaleContributionMessage({ preSaleId, buyer, bpsAmount, ethAmount, transactionHash }, event, discord) {
    try {
        const channel = await getChannel(discord);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🎯 New Presale Purchase')
            .addFields(
                { 
                    name: 'Presale Details', 
                    value: [
                        `**ID:** ${preSaleId}`,
                        `**Buyer:** [${shortenAddress(buyer)}](https://basescan.org/address/${buyer})`,
                        `**Amount:** ${ethAmount} ETH for ${bpsAmount} BPS`,
                        `**Transaction:** [View on Basescan](https://basescan.org/tx/${transactionHash})`
                    ].join('\n')
                }
            )
            .setTimestamp()
            .setFooter({ text: 'Clanker Bot' });

        await channel.send({ embeds: [embed] });

    } catch (error) {
        handleError(error, 'Presale Purchase Message');
    }
}

module.exports = { 
    sendClankerMessage,
    sendPresaleMessage,
    sendPresaleContributionMessage
}; 