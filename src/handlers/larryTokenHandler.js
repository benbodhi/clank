const { formatEther } = require('ethers');
const { settings } = require('../config');
const { sendLarryMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const addresses = require('../contracts/addresses.json');
const logger = require('../utils/logger');

async function handleLarryToken(args, provider, discord) {
    const startTime = Date.now();
    
    try {
        const [token, party, recipient, name, symbol, ethValue, config] = args;
        
        logger.section('📝 New Larry Token Deployment');
        logger.detail('Token Name', `${name} (${symbol})`);
        logger.detail('Token Address', token);
        logger.detail('Deployer', party);
        logger.detail('Recipient', recipient);
        logger.detail('Initial ETH', `${formatEther(ethValue)} ETH`);

        const poolStartTime = Date.now();
        const poolAddress = await getPoolAddress(config, provider);
        logger.detail('Pool Address', poolAddress);
        logger.timing('Pool Resolution', Date.now() - poolStartTime);
        
        let imageUrl = null;
        if (settings.features.displayImages) {
            const imageStartTime = Date.now();
            imageUrl = await getTokenImage(token, provider);
            if (imageUrl) {
                logger.detail('Image URL', imageUrl);
                logger.timing('Image Fetch', Date.now() - imageStartTime);
            }
        }

        await sendLarryMessage({
            name,
            symbol,
            tokenAddress: token,
            deployer: party,
            ethValue: formatEther(ethValue),
            poolAddress,
            ...(imageUrl && { imageUrl })
        }, discord);
        
        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();
    } catch (error) {
        const isNetworkError = handleError(error, 'Larry Token Handler');
        if (isNetworkError) throw error;
    }
}

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
            log.address && log.address.toLowerCase() === addresses.uniswap.factory.toLowerCase()
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
        console.log(`Attempting to fetch image for token: ${tokenAddress}`);
        const tokenContract = new ethers.Contract(
            tokenAddress,
            require('../contracts/abis/token/Token.json'),
            provider
        );

        const imageUrl = await tokenContract.image();
        console.log('Raw image URL from contract:', imageUrl);
        
        if (imageUrl && 
            typeof imageUrl === 'string' && 
            (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
            console.log('Valid image URL found:', imageUrl);
            return imageUrl;
        }
        console.log('Image URL validation failed - URL must start with http:// or https://');
        return null;
    } catch (error) {
        handleError(error, 'Token Image Fetch');
        return null;
    }
}

module.exports = { handleLarryToken }; 