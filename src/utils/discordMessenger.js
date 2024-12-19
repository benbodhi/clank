const { EmbedBuilder } = require('discord.js');
const { settings } = require('../config');
const { getWarpcastUserData } = require('../services/warpcastResolver');
const { handleError } = require('../handlers/errorHandler');
const { ethers } = require('ethers');
const logger = require('./logger');
const { getCrowdfund, updateThreadId } = require('./larryCrowdfundStore');

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

// Clanker-specific Functions
function createClankerEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink, warpcastData) {
    const isClankFun = tokenData.castHash?.toLowerCase().includes('clank.fun');
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

    // Only add FID and Cast field if not a clank.fun deployment
    if (!isClankFun) {
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
        { name: 'LP Position', value: `**[${tokenData.positionId}](https://app.uniswap.org/#/pool/${tokenData.positionId})**`, inline: false }
    );

    return fields;
}

function createClankerMessageContent(tokenData, warpcastData) {
    const messages = [];
    const fid = Number(tokenData.fid);
    const followers = warpcastData?.followerCount || 0;
    const isClankFun = tokenData.castHash?.toLowerCase().includes('clank.fun');
    
    if (isClankFun) {
        messages.push(`**<@&${process.env.CLANKFUN_DEPLOYER_ROLE}> 🤖**\n`);
    } else if (fid > 0) {  // Only show FID notifications for non-clank.fun and valid FIDs
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
        
        // Follower threshold notifications (only for non-clank.fun and valid FIDs)
        if (followers >= settings.followerThresholds.over5000) {
            const thresholds = [5000, 10000, 20000, 50000, 100000, 200000];
            for (const threshold of thresholds) {
                if (followers >= threshold) {
                    messages.push(`**<@&${process.env[`FOLLOWERS_OVER_${threshold}_ROLE`]}> ${getFollowerEmoji(threshold)}**\n`);
                }
            }
        }
    }
    
    if (messages.length > 0) {
        if (isClankFun) {
            messages.push(`\n**Clank.fun Deployment**`);
        } else if (fid > 0) {
            messages.push(`\n**FID: ${fid.toLocaleString()} | Followers: ${followers.toLocaleString()}**`);
        }
    }
    
    return messages.join('');
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

        // Fetch Warpcast data
        const warpcastData = await getWarpcastUserData(tokenData.fid);
        if (warpcastData?.timing) {
            timings.warpcastFetch = warpcastData.timing;
        }

        const embed = new EmbedBuilder()
            .setColor(determineEmbedColor(tokenData.fid, warpcastData?.followerCount))
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

async function sendLarryMessage(tokenData, discord) {
    try {
        const channel = await discord.channels.fetch(process.env.DISCORD_LARRY_CHANNEL_ID);
        if (!channel) {
            throw new Error('Could not find Larry Discord channel');
        }

        const embed = new EmbedBuilder()
            .setTitle('🦜 New Larry Token Deployed')
            .setColor(0x00ff00)
            .addFields([
                { name: 'Name', value: tokenData.name, inline: true },
                { name: 'Symbol', value: tokenData.symbol, inline: true },
                { name: 'Token Address', value: `[${tokenData.tokenAddress}](https://basescan.org/address/${tokenData.tokenAddress})`, inline: false },
                { name: 'Deployer', value: formatDeployerField(tokenData.deployer), inline: false },
                { name: 'Initial ETH', value: `${tokenData.ethValue} ETH`, inline: true }
            ])
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        handleError(error, 'Larry Discord Message');
        throw error;
    }
}

function determineEmbedColor(fid, followers) {
    let embedColor = '#0099ff'; // default blue

    // Check for clank.fun deployment (fid will be 0)
    if (fid === 0) {
        embedColor = '#ff9900'; // orange for clank.fun deployments
        return embedColor;
    }

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

function formatCountdown(endTime) {
    const now = Math.floor(Date.now() / 1000);
    const remaining = endTime - now;
    
    if (remaining <= 0) return "Presale Ended";
    
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `⏰ ${minutes}m ${seconds}s remaining`;
}

async function sendLarryPartyMessage({
    creator,
    crowdfund,
    party,
    tokenName,
    tokenSymbol,
    tokenAddress,
    totalSupply,
    endTime,
    larryUrl
}, discord) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`🎉 New Larry Party: ${tokenName}`)
        .setDescription(`A new Larry Party has been created for ${tokenName} (${tokenSymbol})`)
        .addFields(
            { name: 'Creator', value: `[${creator}](https://basescan.org/address/${creator})`, inline: true },
            { name: 'Total Supply', value: `${totalSupply} tokens`, inline: true },
            { name: 'End Time', value: `<t:${endTime}:R>`, inline: true },
            { name: 'Crowdfund', value: `[View](https://basescan.org/address/${crowdfund})`, inline: true },
            { name: 'Party', value: `[View](https://basescan.org/address/${party})`, inline: true },
            tokenAddress ? { 
                name: 'Token', 
                value: `[View](https://basescan.org/address/${tokenAddress})`, 
                inline: true 
            } : { 
                name: 'Token', 
                value: 'Available after finalization', 
                inline: true 
            },
            { name: 'Larry Club', value: `[View Party](${larryUrl})` }
        )
        .setTimestamp();

    const channel = await discord.channels.fetch(process.env.DISCORD_LARRY_CHANNEL_ID);
    return await channel.send({ embeds: [embed] });
}

async function sendLarryContributionMessage(contributionDetails, discord) {
    try {
        const channel = await discord.channels.fetch(process.env.DISCORD_LARRY_CHANNEL_ID);
        if (!channel) {
            throw new Error('Could not find Larry Discord channel');
        }

        const embed = new EmbedBuilder()
            .setTitle('💰 New Contribution to Larry Party')
            .setColor(0x00ff00)
            .addFields([
                { name: 'Party Address', value: `[${contributionDetails.partyAddress}](https://basescan.org/address/${contributionDetails.partyAddress})`, inline: false },
                { name: 'Contributor', value: `[${contributionDetails.contributor}](https://basescan.org/address/${contributionDetails.contributor})`, inline: true },
                { name: 'Amount', value: `${contributionDetails.amount} ETH`, inline: true },
                { name: 'Total Contributed', value: `${contributionDetails.totalContributed} ETH`, inline: true }
            ])
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        handleError(error, 'Larry Contribution Discord Message');
        throw error;
    }
}

async function updateLarryPartyMessage({ messageId, tokenName, tokenSymbol, larryUrl, newContribution }, discord) {
    try {
        logger.section('📝 Updating Larry Party Message');
        const channel = await discord.channels.fetch(process.env.DISCORD_LARRY_CHANNEL_ID);
        if (!channel) {
            throw new Error('Discord channel not found');
        }

        const message = await channel.messages.fetch(messageId);
        if (!message) {
            throw new Error('Message not found');
        }

        // Get crowdfund data to check for existing thread
        const crowdfund = await getCrowdfund(newContribution.crowdfundAddress);
        if (!crowdfund) {
            throw new Error('Crowdfund data not found');
        }

        // Get or create thread
        let thread;
        if (crowdfund.threadId) {
            try {
                thread = await channel.threads.fetch(crowdfund.threadId);
            } catch (error) {
                logger.warn('Could not fetch existing thread:', error.message);
            }
        }

        if (!thread) {
            thread = await message.startThread({
                name: `${tokenName} (${tokenSymbol}) Contributions`,
                autoArchiveDuration: 1440 // 24 hours
            });
            // Store thread ID in Redis
            await updateThreadId(newContribution.crowdfundAddress, thread.id);
            logger.detail('Created New Thread', thread.id);
        }

        // Send contribution update to thread
        const contributionEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('New Contribution')
            .addFields([
                { name: 'Contributor', value: `[${newContribution.contributor}](https://basescan.org/address/${newContribution.contributor})`, inline: true },
                { name: 'Amount', value: `${newContribution.amount} ETH`, inline: true },
                { name: 'Total', value: `${newContribution.totalContributed} ETH`, inline: true },
                { name: 'Transaction', value: `[View](https://basescan.org/tx/${newContribution.transactionHash})`, inline: true }
            ])
            .setTimestamp();

        await thread.send({ embeds: [contributionEmbed] });

        // Update the main message with total contributed
        const embed = EmbedBuilder.from(message.embeds[0]);
        const totalField = embed.data.fields.find(f => f.name === 'Total Contributed');
        if (!totalField) {
            embed.addFields({ name: 'Total Contributed', value: `${newContribution.totalContributed} ETH`, inline: true });
        } else {
            totalField.value = `${newContribution.totalContributed} ETH`;
        }

        await message.edit({ embeds: [embed] });
        logger.detail('Message Updated', messageId);
        logger.sectionEnd();
    } catch (error) {
        const isNetworkError = handleError(error, 'Discord Message Update');
        if (isNetworkError) throw error;
    }
}

// Helper function to shorten addresses
function shortenAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function sendTradeMessage({ tokenAddress, messageId, provider, discord }) {
    try {
        const channel = await discord.channels.fetch(process.env.DISCORD_LARRY_CHANNEL_ID);
        if (!channel) {
            throw new Error('Could not find Larry Discord channel');
        }

        // Get the original message
        const originalMessage = await channel.messages.fetch(messageId);
        if (!originalMessage) {
            throw new Error('Could not find original message');
        }

        // Fetch the pool address with error handling
        let poolAddress;
        try {
            poolAddress = await getPoolAddress(tokenAddress, provider);
            logger.detail('Pool Address Retrieved', poolAddress);
        } catch (error) {
            logger.warn('Failed to get pool address:', error.message);
            poolAddress = null;
        }

        const photonLink = poolAddress ? ` | **[Photon](https://photon-base.tinyastro.io/en/lp/${poolAddress})**` : '';
        const tradeLinks = `${tokenAddress}\n**[Basescan](https://basescan.org/token/${tokenAddress})** | **[Dexscreener](https://dexscreener.com/base/${tokenAddress})** | **[Uniswap](https://app.uniswap.org/#/swap?chain=base&outputCurrency=${tokenAddress})**${photonLink}`;

        // Update the original message
        const originalEmbed = originalMessage.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed);
        
        // Find the Token Contract field and update it
        const tokenFieldIndex = originalEmbed.fields.findIndex(field => field.name === 'Token Contract');
        if (tokenFieldIndex !== -1) {
            updatedEmbed.spliceFields(tokenFieldIndex, 1, { 
                name: 'Token Contract', 
                value: tradeLinks,
                inline: false 
            });
        }

        await originalMessage.edit({ embeds: [updatedEmbed] });

        // Send new message as a reply
        const tradeEmbed = new EmbedBuilder()
            .setTitle('🎉 LP Deployed - Start Trading!')
            .setColor(0x0099ff) // Discord blue
            .addFields([
                { 
                    name: 'Token Contract', 
                    value: tradeLinks,
                    inline: false 
                }
            ])
            .setTimestamp();

        await channel.send({ 
            embeds: [tradeEmbed],
            reply: { messageReference: messageId, failIfNotExists: false }
        });

    } catch (error) {
        handleError(error, 'Trade Message');
        throw error;
    }
}

module.exports = { 
    sendClankerMessage,
    sendLarryMessage,
    sendLarryPartyMessage,
    sendLarryContributionMessage,
    updateLarryPartyMessage,
    sendTradeMessage
}; 