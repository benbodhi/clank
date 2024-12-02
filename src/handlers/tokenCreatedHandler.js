const { formatUnits } = require('ethers');
const config = require('../../config');
const { sendDiscordMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const ethers = require('ethers');

/**
 * Handles new token creation events
 * @param {Array} args - Event arguments from contract
 * @param {ethers.Provider} provider - Ethers provider instance
 * @param {Discord.Client} discord - Discord client instance
 */
async function handleTokenCreated(args, provider, discord) {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    try {
        if (!args || args.length === 0) {
            throw new Error('Invalid event arguments received');
        }

        const event = args[args.length - 1];
        const [
            tokenAddress,
            lpNftId,
            deployer,
            fid,
            name,
            symbol,
            supply,
            lockerAddress,
            castHash
        ] = args;

        // Validate required fields
        if (!tokenAddress || !deployer || !fid) {
            throw new Error('Missing required token data');
        }

        console.log(`\n[${timestamp}] 📝 New token deployment detected`);
        console.log('\nToken Details:');
        console.log(`Name: ${name} (${symbol})`);
        console.log(`Token Address: ${tokenAddress}`);
        console.log(`Deployer: ${deployer}`);
        console.log(`FID: ${fid}`);
        
        // Get pool address
        console.time('Pool Address Resolution');
        const poolAddress = await getPoolAddress(event, provider);
        console.timeEnd('Pool Address Resolution');
        
        // Only fetch image if enabled in config
        let imageUrl = null;
        if (config.features.displayImages) {
            console.time('Image Fetch');
            imageUrl = await getTokenImage(tokenAddress, provider);
            console.timeEnd('Image Fetch');
        }
        
        const tokenData = {
            tokenAddress,
            lpNftId,
            deployer,
            fid,
            name,
            symbol,
            supply: formatUnits(supply, 18),
            lockerAddress,
            castHash,
            poolAddress,
            ...(imageUrl && { imageUrl })
        };

        // Send Discord notification
        console.time('Discord Message Send');
        await sendDiscordMessage(tokenData, event.log, discord);
        console.timeEnd('Discord Message Send');

        const processingTime = Date.now() - startTime;
        console.log(`\n✅ Process completed in ${processingTime}ms\n`);

    } catch (error) {
        handleError(error, 'Token Created Handler');
    }
}

/**
 * Retrieves pool address from transaction receipt
 * @param {Object} event - Contract event object
 * @param {ethers.Provider} provider - Ethers provider instance
 * @returns {Promise<string>} Pool address or empty string
 */
async function getPoolAddress(event, provider) {
    const timestamp = new Date().toISOString();

    if (!event?.log?.transactionHash) {
        console.log(`[${timestamp}] ⚠️ No transaction hash found in event`);
        return '';
    }

    try {
        console.log(`[${timestamp}] Transaction Hash: ${event.log.transactionHash}`);
        const txReceipt = await provider.getTransactionReceipt(event.log.transactionHash);
        
        if (!txReceipt) {
            console.log(`[${timestamp}] ⚠️ No transaction receipt found`);
            return '';
        }

        const poolCreatedLog = txReceipt.logs.find(log => 
            log.address && log.address.toLowerCase() === config.contracts.uniswapFactory.toLowerCase()
        );

        if (poolCreatedLog) {
            const poolAddress = '0x' + poolCreatedLog.data.slice(-40);
            console.log(`[${timestamp}] Pool Address: ${poolAddress}`);
            return poolAddress;
        }

        console.log(`[${timestamp}] ℹ️ No pool created log found`);
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
            config.abis.token,
            provider
        );

        const imageUrl = await tokenContract.image();
        
        // Basic URL validation
        if (imageUrl && 
            typeof imageUrl === 'string' && 
            (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
            return imageUrl;
        }
        return null;
    } catch (error) {
        handleError(error, 'Token Image Fetch');
        return null;
    }
}

module.exports = { handleTokenCreated }; 