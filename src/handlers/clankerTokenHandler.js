const { formatUnits } = require('ethers');
const { settings } = require('../config');
const { sendClankerMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const addresses = require('../contracts/addresses.json');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

/**
 * Handles new token creation events
 * @param {Object} args - Event arguments from contract
 * @param {ethers.Provider} provider - Ethers provider instance
 * @param {Discord.Client} discord - Discord client instance
 */
async function handleClankerToken({
    tokenAddress,
    lpNftId,
    deployer,
    fid,
    name,
    symbol,
    supply,
    lockerAddress,
    castHash,
    event,
    provider,
    discord
}) {
    const startTime = Date.now();
    const timings = {};
    
    try {
        logger.section('📝 New Clanker Token Deployment');
        logger.detail('Token Name', `${name} (${symbol})`);
        logger.detail('Token Address', tokenAddress);
        logger.detail('Deployer', deployer);
        logger.detail('FID', fid);
        logger.detail('Transaction', event.log.transactionHash);
        logger.detail('LP NFT ID', lpNftId);
        logger.detail('Total Supply', formatUnits(supply, 18));
        logger.detail('Locker Address', lockerAddress);
        logger.detail('Cast Hash', castHash);
        
        // Get pool address
        const poolStartTime = Date.now();
        const poolAddress = await getPoolAddress(event, provider);
        logger.detail('Pool Address', poolAddress);
        timings.poolResolution = Date.now() - poolStartTime;
        
        // Only fetch image if enabled in config
        let imageUrl = null;
        if (settings.features.displayImages) {
            const imageStartTime = Date.now();
            imageUrl = await getTokenImage(tokenAddress, provider);
            logger.detail('Image URL', imageUrl);
            timings.imageFetch = Date.now() - imageStartTime;
        }

        // Send Discord notification
        await sendClankerMessage({
            tokenAddress,
            lpNftId,
            deployer,
            fid,
            name,
            symbol,
            totalSupply: Number(formatUnits(supply, 18)).toLocaleString(undefined, {
                maximumFractionDigits: 0
            }),
            lockerAddress,
            castHash,
            poolAddress,
            ...(imageUrl && { imageUrl })
        }, event.log, discord, timings);

        // Log all timings together
        logger.section('⏱️  Timing Summary');
        if (timings.poolResolution) logger.timing('Pool Resolution', timings.poolResolution);
        if (timings.imageFetch) logger.timing('Image Fetch', timings.imageFetch);
        if (timings.warpcastFetch) logger.timing('Warpcast Data Fetch', timings.warpcastFetch);
        if (timings.discordSend) logger.timing('Discord Message Send', timings.discordSend);
        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();

    } catch (error) {
        const isNetworkError = handleError(error, 'Clanker Token Handler');
        if (isNetworkError) throw error;
    }
}

/**
 * Retrieves pool address from transaction receipt
 * @param {Object} event - Contract event object
 * @param {ethers.Provider} provider - Ethers provider instance
 * @returns {Promise<string>} Pool address or empty string
 */
async function getPoolAddress(event, provider) {
    try {
        const txReceipt = await provider.getTransactionReceipt(event.log.transactionHash);
        
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