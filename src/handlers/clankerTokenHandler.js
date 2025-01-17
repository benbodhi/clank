const { formatUnits } = require('ethers');
const { settings } = require('../config');
const { sendClankerMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const { getWarpcastUserData } = require('../services/warpcastResolver');
const addresses = require('../contracts/addresses.json');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

function formatSupplyWithCommas(supply) {
    // Remove decimals and format with commas
    return Number(formatUnits(supply, 18)).toLocaleString('en-US', {
        maximumFractionDigits: 0
    });
}

/**
 * Handles new token creation events
 * @param {Object} args - Event arguments from contract
 * @param {ethers.Provider} provider - Ethers provider instance
 * @param {Discord.Client} discord - Discord client instance
 */
async function handleClankerToken({
    tokenAddress,
    positionId,
    deployer,
    fid,
    name,
    symbol,
    supply,
    castHash,
    event,
    provider,
    discord,
    wethAddress
}) {
    const timings = {};
    const startTime = Date.now();

    try {
        // Get Warpcast data first
        const warpcastData = await getWarpcastUserData(fid);
        
        // Skip notifications for 0 follower accounts unless it's a clank.fun deployment
        if (warpcastData && 
            warpcastData.followerCount === 0 && 
            !castHash?.toLowerCase().includes('clank.fun')) {
            logger.detail('Skipping notification for 0 follower account', fid);
            return;
        }

        logger.section('📝 New Clanker Token Deployment');
        logger.detail('Token Name', `${name} (${symbol})`);
        logger.detail('Token Address', tokenAddress);
        logger.detail('Deployer', deployer);
        logger.detail('FID', fid);
        logger.detail('Transaction', event.transactionHash);
        logger.detail('LP NFT ID', positionId.toString());
        logger.detail('Total Supply', formatSupplyWithCommas(supply));
        logger.detail('WETH Address', wethAddress);
        logger.detail('Cast Hash', castHash);

        // Get pool address from transaction logs
        const poolResolutionStart = Date.now();
        const poolAddress = await getPoolAddress(event.transactionHash, provider);
        timings.poolResolution = Date.now() - poolResolutionStart;
        logger.detail('Pool Address', poolAddress);

        // Fetch image URL if available
        const imageFetchStart = Date.now();
        let imageUrl;
        try {
            const tokenContract = new ethers.Contract(
                tokenAddress,
                require('../contracts/abis/token/Token.json'),
                provider
            );
            imageUrl = await tokenContract.image();
            logger.detail('Image URL', imageUrl);
        } catch (error) {
            logger.warn('No image URL found');
        }
        timings.imageFetch = Date.now() - imageFetchStart;

        // Send Discord message
        await sendClankerMessage({
            name,
            symbol,
            tokenAddress,
            deployer,
            fid: fid.toString(),
            positionId: positionId.toString(),
            totalSupply: formatSupplyWithCommas(supply),
            transactionHash: event.transactionHash,
            poolAddress,
            imageUrl,
            castHash
        }, event, discord, timings);

        // Log timings
        logger.section('⏱️  Timing Summary');
        if (timings.poolResolution) logger.timing('Pool Resolution', timings.poolResolution);
        if (timings.imageFetch) logger.timing('Image Fetch', timings.imageFetch);
        if (timings.discordSend) logger.timing('Discord Message Send', timings.discordSend);
        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();

    } catch (error) {
        const isNetworkError = handleError(error, 'Token Creation Handler');
        if (isNetworkError) throw error;
    }
}

/**
 * Retrieves pool address from transaction receipt
 * @param {Object} event - Contract event object
 * @param {ethers.Provider} provider - Ethers provider instance
 * @returns {Promise<string>} Pool address or empty string
 */
async function getPoolAddress(txHash, provider) {
    try {
        if (!txHash) {
            logger.warn('No transaction hash provided');
            return '';
        }

        const txReceipt = await provider.getTransactionReceipt(txHash);
        
        if (!txReceipt) {
            logger.warn('No transaction receipt found');
            return '';
        }

        const poolCreatedLog = txReceipt.logs.find(log => 
            log.address && log.address.toLowerCase() === addresses.uniswap.factory.toLowerCase()
        );

        if (poolCreatedLog) {
            const poolAddress = '0x' + poolCreatedLog.data.slice(-40);
            return poolAddress;
        }

        logger.warn('No pool created log found');
        return '';

    } catch (error) {
        handleError(error, 'Pool Address Resolution');
        return '';
    }
}

async function getTokenImage(tokenAddress, provider) {
    try {
        const tokenContract = new ethers.Contract(
            tokenAddress,
            require('../contracts/abis/token/Token.json'),
            provider
        );

        const imageUrl = await tokenContract.image();
        
        // Basic URL validation
        if (imageUrl && 
            typeof imageUrl === 'string' && 
            (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
            logger.detail('Image URL', imageUrl);
            return imageUrl;
        }
        
        logger.detail('Image URL', 'Not found or invalid');
        return null;
    } catch (error) {
        const isNetworkError = handleError(error, 'Token Image Fetch');
        if (isNetworkError) throw error;
        return null;
    }
}

module.exports = { handleClankerToken }; 
