const { ethers } = require('ethers');
const { sendLarryPartyMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const { addCrowdfund } = require('../utils/larryCrowdfundStore');
const logger = require('../utils/logger');

async function handleLarryPartyCreated({
    creator,
    crowdfund,
    party,
    crowdfundOpts,
    partyOpts,
    tokenOpts,
    transactionHash,
    provider,
    discord
}) {
    const startTime = Date.now();
    
    try {
        // Validate required parameters
        if (!creator || !crowdfund || !party || !tokenOpts || !provider || !discord) {
            throw new Error('Missing required parameters for Larry Party creation');
        }

        // Validate token options
        if (!tokenOpts.name || !tokenOpts.symbol || !tokenOpts.totalSupply) {
            throw new Error('Invalid token options provided');
        }

        logger.section('🎉 New Larry Party Created');
        logger.detail('Token Name', `${tokenOpts.name} (${tokenOpts.symbol})`);
        logger.detail('Creator', creator);
        logger.detail('Crowdfund Address', crowdfund);
        logger.detail('Party Address', party);
        logger.detail('Transaction', transactionHash);
        logger.detail('Larry Club URL', `https://www.larry.club/token/${crowdfund}`);

        // Get end time from current time + 15 minutes
        const endTime = Math.floor(Date.now() / 1000) + (15 * 60);
        logger.detail('End Time', new Date(endTime * 1000).toISOString());

        const messageStartTime = Date.now();
        const message = await sendLarryPartyMessage({
            creator,
            crowdfund,
            party,
            tokenName: tokenOpts.name,
            tokenSymbol: tokenOpts.symbol,
            tokenAddress: null, // Will be updated when finalized
            totalSupply: ethers.formatEther(tokenOpts.totalSupply),
            endTime,
            larryUrl: `https://www.larry.club/token/${crowdfund}`
        }, discord);

        if (!message?.id) {
            throw new Error('Failed to send Discord message');
        }

        await addCrowdfund(crowdfund, message.id);
        logger.detail('Discord Message ID', message.id);
        
        logger.timing('Discord Message', Date.now() - messageStartTime);
        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();
    } catch (error) {
        const isNetworkError = handleError(error, 'Larry Party Created Handler');
        if (isNetworkError) throw error;
    }
}

module.exports = { handleLarryPartyCreated }; 