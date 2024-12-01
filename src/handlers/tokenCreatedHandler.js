const { formatUnits } = require('ethers');
const config = require('../../config');
const { sendDiscordMessage } = require('../utils/discordMessenger');
const { handleError } = require('../utils/errorHandler');

async function handleTokenCreated(args, provider, discord) {
    try {
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

        const timestamp = new Date().toISOString();
        console.log(`\n New token created at ${timestamp}`);
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

        await sendDiscordMessage(tokenData, event.log, discord, provider);
        console.log(`[${timestamp}] ✅ Discord notification sent successfully\n`);

    } catch (error) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ❌ Error processing token creation:`);
        handleError(error, 'Token Created Handler');
    }
}

async function getPoolAddress(event, provider) {
    if (event?.log?.transactionHash) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Transaction Hash: ${event.log.transactionHash}`);
        const txReceipt = await provider.getTransactionReceipt(event.log.transactionHash);
        if (txReceipt) {
            const poolCreatedLog = txReceipt.logs.find(log => 
                log.address.toLowerCase() === config.uniswapFactory.toLowerCase()
            );
            if (poolCreatedLog) {
                const poolAddress = '0x' + poolCreatedLog.data.slice(-40);
                console.log(`[${timestamp}] Pool Address: ${poolAddress}`);
                return poolAddress;
            }
            console.log(`[${timestamp}] No pool created log found`);
        }
    } else {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Warning: No transaction hash found in event`);
    }
    return '';
}

module.exports = { handleTokenCreated }; 