const { formatUnits } = require('ethers');
const { sendPresaleMessage, sendPresaleContributionMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const logger = require('../utils/logger');

async function handlePresaleCreated({
    preSaleId,
    bpsAvailable,
    ethPerBps,
    endTime,
    deployer,
    fid,
    name,
    symbol,
    supply,
    castHash,
    event,
    provider,
    discord
}) {
    try {
        logger.section('📢 New Clanker Presale Created');
        logger.detail('Token Name', `${name} (${symbol})`);
        logger.detail('Presale ID', preSaleId.toString());
        logger.detail('Deployer', deployer);
        logger.detail('FID', fid.toString());
        logger.detail('Transaction', event.transactionHash);
        logger.detail('Total Supply', formatUnits(supply, 18));
        logger.detail('BPS Available', bpsAvailable.toString());
        logger.detail('ETH per BPS', formatUnits(ethPerBps, 18));

        await sendPresaleMessage({
            preSaleId: preSaleId.toString(),
            deployer,
            fid: fid.toString(),
            name,
            symbol,
            totalSupply: formatUnits(supply, 18),
            bpsAvailable: bpsAvailable.toString(),
            ethPerBps: formatUnits(ethPerBps, 18),
            endTime: Number(endTime),
            castHash,
            transactionHash: event.transactionHash
        }, event, discord);

        logger.detail('End Time', new Date(Number(endTime) * 1000).toUTCString());
        logger.sectionEnd();
        
    } catch (error) {
        const isNetworkError = handleError(error, 'Presale Creation Handler');
        if (isNetworkError) throw error;
    }
}

async function handlePresalePurchase({
    preSaleId,
    buyer,
    ethAmount,
    event,
    provider,
    discord
}) {
    try {
        logger.section('💰 New Presale Purchase');
        logger.detail('Presale ID', preSaleId.toString());
        logger.detail('Buyer', buyer);
        logger.detail('ETH Amount', formatUnits(ethAmount, 18));
        logger.detail('Transaction', event.transactionHash);

        // Get presale config to include token details in the message
        const presaleConfig = await provider.clankerPresale.preSaleConfigs(preSaleId);
        
        await sendPresaleContributionMessage({
            preSaleId: preSaleId.toString(),
            buyer,
            ethAmount: formatUnits(ethAmount, 18),
            ethPerBps: formatUnits(presaleConfig.ethPerBps, 18),
            bpsAmount: ethAmount / presaleConfig.ethPerBps,
            transactionHash: event.transactionHash
        }, event, discord);

    } catch (error) {
        const isNetworkError = handleError(error, 'Presale Purchase Handler');
        if (isNetworkError) throw error;
    }
}

module.exports = {
    handlePresaleCreated,
    handlePresalePurchase
}; 