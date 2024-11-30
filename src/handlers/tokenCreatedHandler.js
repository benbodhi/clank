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

        console.log(`\n New token deployment detected: ${name} (${symbol})`);
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
        console.log('✅ Discord notification sent successfully\n');

    } catch (error) {
        handleError(error, 'Token Created Handler');
    }
}

async function getPoolAddress(event, provider) {
    if (event?.log?.transactionHash) {
        console.log(`Transaction Hash: ${event.log.transactionHash}`);
        const txReceipt = await provider.getTransactionReceipt(event.log.transactionHash);
        if (txReceipt) {
            const poolCreatedLog = txReceipt.logs.find(log => 
                log.address.toLowerCase() === config.uniswapFactory.toLowerCase()
            );
            if (poolCreatedLog) {
                const poolAddress = '0x' + poolCreatedLog.data.slice(-40);
                console.log(`Pool Address: ${poolAddress}`);
                return poolAddress;
            }
            console.log('No pool created log found');
        }
    } else {
        console.log('Warning: No transaction hash found in event');
    }
    return '';
}

module.exports = { handleTokenCreated }; 