const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { getWarpcastUserData } = require('../services/warpcastResolver');
const { handleError } = require('../handlers/errorHandler');
const { ethers } = require('ethers');

/**
 * Sends a Discord message with token creation details
 * @param {Object} tokenData - Token creation data
 * @param {Object} eventLog - Event log data
 * @param {Discord.Client} discord - Discord client instance
 */
async function sendDiscordMessage(tokenData, eventLog, discord) {
    try {
        const channel = await discord.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        if (!channel) {
            throw new Error('Could not find Discord channel');
        }

        const warpcastData = await getWarpcastUserData(tokenData.fid);
        
        if (warpcastData?.followerCount === 0) {
            console.log(`Skipping notification for FID ${tokenData.fid} with 0 followers.`);
            return;
        }

        const embed = await createEmbed(tokenData, warpcastData);
        const content = createMessageContent(tokenData, warpcastData);

        await channel.send({ content, embeds: [embed] });
    } catch (error) {
        handleError(error, 'Discord Message');
        throw error;
    }
}

function formatDeployerField(address) {
    try {
        const checksummedAddress = ethers.getAddress(address);
        return `${checksummedAddress}\n**[Basescan](https://basescan.org/address/${address})** | **[Etherscan](https://etherscan.io/address/${address})**`;
    } catch (error) {
        handleError(error, 'Address Formatting');
        return `${address}\n**[Basescan](https://basescan.org/address/${address})** | **[Etherscan](https://etherscan.io/address/${address})**`;
    }
}

async function createEmbed(tokenData, warpcastData) {
    try {
        const deployerField = formatDeployerField(tokenData.deployer);
        const uniswapTradeLink = createUniswapTradeLink(tokenData.tokenAddress);
        const photonLink = tokenData.poolAddress ? 
            `| **[Photon](https://photon-base.tinyastro.io/en/lp/${tokenData.poolAddress})**` : 
            '';

        // Determine embed color based on thresholds
        let embedColor = '#0099ff'; // default blue

        const fid = Number(tokenData.fid);
        const followers = warpcastData?.followerCount || 0;

        // FID colors (greens)
        if (fid < config.fidThresholds.below1000) {
            embedColor = '#00ff00'; // bright green
        } else if (fid < config.fidThresholds.below5000) {
            embedColor = '#00dd00'; // medium green
        } else if (fid < config.fidThresholds.below10000) {
            embedColor = '#00bb00'; // darker green
        }

        // Follower colors (purples) - override FID colors if higher threshold met
        if (followers >= config.followerThresholds.over200000) {
            embedColor = '#ff00ff'; // bright purple
        } else if (followers >= config.followerThresholds.over100000) {
            embedColor = '#dd00dd'; // medium purple
        } else if (followers >= config.followerThresholds.over50000) {
            embedColor = '#bb00bb'; // darker purple
        } else if (followers >= config.followerThresholds.over20000) {
            embedColor = '#990099'; // deep purple
        } else if (followers >= config.followerThresholds.over10000) {
            embedColor = '#770077'; // very deep purple
        } else if (followers >= config.followerThresholds.over5000) {
            embedColor = '#550055'; // darkest purple
        }

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle('🔔 Clank Clank!')
            .addFields(
                ...createEmbedFields(tokenData, deployerField, uniswapTradeLink, photonLink, warpcastData)
            )
            .setTimestamp();

        // Add image if available
        if (tokenData.imageUrl) {
            embed.setImage(tokenData.imageUrl);
        }

        return embed;
    } catch (error) {
        handleError(error, 'Discord Embed Creation');
        throw error;
    }
}

function createMessageContent(tokenData, warpcastData) {
    const messages = [];
    const fid = Number(tokenData.fid);
    const followers = warpcastData?.followerCount || 0;
    
    // FID threshold notifications (cascade down)
    if (fid < config.fidThresholds.below1000) {
        messages.push(`**<@&${process.env.FID_BELOW_1000_ROLE}> 🔥**\n`);
        messages.push(`**<@&${process.env.FID_BELOW_5000_ROLE}> 👀**\n`);
        messages.push(`**<@&${process.env.FID_BELOW_10000_ROLE}> 📊**\n`);
    } else if (fid < config.fidThresholds.below5000) {
        messages.push(`**<@&${process.env.FID_BELOW_5000_ROLE}> 👀**\n`);
        messages.push(`**<@&${process.env.FID_BELOW_10000_ROLE}> 📊**\n`);
    } else if (fid < config.fidThresholds.below10000) {
        messages.push(`**<@&${process.env.FID_BELOW_10000_ROLE}> 📊**\n`);
    }
    
    // Follower threshold notifications (cascade up)
    if (followers >= config.followerThresholds.over200000) {
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_5000_ROLE}> 📈**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_10000_ROLE}> ✨**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_20000_ROLE}> ⭐**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_50000_ROLE}> 💫**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_100000_ROLE}> 🚀**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_200000_ROLE}> 🌟**\n`);
    } else if (followers >= config.followerThresholds.over100000) {
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_5000_ROLE}> 📈**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_10000_ROLE}> ✨**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_20000_ROLE}> ⭐**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_50000_ROLE}> 💫**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_100000_ROLE}> 🚀**\n`);
    } else if (followers >= config.followerThresholds.over50000) {
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_5000_ROLE}> 📈**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_10000_ROLE}> ✨**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_20000_ROLE}> ⭐**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_50000_ROLE}> 💫**\n`);
    } else if (followers >= config.followerThresholds.over20000) {
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_5000_ROLE}> 📈**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_10000_ROLE}> ✨**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_20000_ROLE}> ⭐**\n`);
    } else if (followers >= config.followerThresholds.over10000) {
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_5000_ROLE}> 📈**\n`);
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_10000_ROLE}> ✨**\n`);
    } else if (followers >= config.followerThresholds.over5000) {
        messages.push(`**<@&${process.env.FOLLOWERS_OVER_5000_ROLE}> 📈**\n`);
    }
    
    // Add FID and Follower count information only if there are threshold tags
    if (messages.length > 0) {
        messages.push(`\n**FID: ${fid.toLocaleString()} | Followers: ${followers.toLocaleString()}**`);
    }
    
    return messages.join('');
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
        { name: 'LP Position', value: `**[${tokenData.lpNftId}](https://app.uniswap.org/#/pool/${tokenData.lpNftId})**`, inline: false }
    ];

    return fields;
}

module.exports = { sendDiscordMessage }; 