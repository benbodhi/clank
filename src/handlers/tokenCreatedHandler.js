const { formatUnits } = require('ethers');
const config = require('../../config');
const { sendDiscordMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');

/**
 * Handles new token creation events
 * @param {Array} args - Event arguments from contract
 * @param {ethers.Provider} provider - Ethers provider instance
 * @param {Discord.Client} discord - Discord client instance
 */
async function handleTokenCreated(args, provider, discord) {
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

        console.log(`\n[${timestamp}] 📝 New token deployment detected:`);
        console.log(`Name: ${name} (${symbol})`);
        console.log(`Token Address: ${tokenAddress}`);
        console.log(`Deployer: ${deployer}`);
        console.log(`FID: ${fid}`);
        
        const poolAddress = await getPoolAddress(event, provider);
        
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
            poolAddress
        };

        await sendDiscordMessage(tokenData, event.log, discord);
        console.log(`[${timestamp}] ✅ Discord notification sent successfully\n`);

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

module.exports = { handleTokenCreated }; 