const { ethers } = require('ethers');
const { sendTradeMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const { updateCrowdfundStatus } = require('../utils/larryCrowdfundStore');
const logger = require('../utils/logger');

async function handlePresaleFinalized(event, provider, discord) {
    const startTime = Date.now();
    
    try {
        logger.section(' Larry Party Finalized');
        const crowdfundAddress = event.address;
        logger.detail('Crowdfund Address', crowdfundAddress);
        logger.detail('Transaction', event.transactionHash);

        const crowdfundContract = new ethers.Contract(
            crowdfundAddress,
            require('../contracts/abis/larry/ERC20LaunchCrowdfundImpl.json'),
            provider
        );

        const tokenAddress = await crowdfundContract.token();
        logger.detail('Token Address', tokenAddress);

        await Promise.all([
            updateCrowdfundStatus(crowdfundAddress, { 
                status: 'finalized',
                tokenAddress 
            }),
            sendTradeMessage(crowdfundAddress, tokenAddress, provider, discord)
        ]);

        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();
    } catch (error) {
        const isNetworkError = handleError(error, 'Presale Finalized Handler');
        if (isNetworkError) throw error;
    }
}

async function handlePresaleRefunded(event, provider, discord) {
    const startTime = Date.now();
    
    try {
        logger.section('💫 Larry Party Refunded');
        const crowdfundAddress = event.address;
        logger.detail('Crowdfund Address', crowdfundAddress);
        logger.detail('Transaction', event.transactionHash);

        await updateCrowdfundStatus(crowdfundAddress, { 
            status: 'refunded',
            tokenAddress: null
        });

        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();
    } catch (error) {
        const isNetworkError = handleError(error, 'Presale Refunded Handler');
        if (isNetworkError) throw error;
    }
}

module.exports = {
    handlePresaleFinalized,
    handlePresaleRefunded
}; 