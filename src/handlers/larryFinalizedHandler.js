const { ethers } = require('ethers');
const { handleError } = require('./errorHandler');
const { updateCrowdfundStatus, getCrowdfund } = require('../utils/larryCrowdfundStore');
const { updateLarryPartyMessage } = require('../utils/discordMessenger');
const logger = require('../utils/logger');

async function handleLarryFinalized(event, provider, discord) {
    const startTime = Date.now();
    
    try {
        logger.section(' Larry Party Finalized');
        const crowdfundAddress = event.address;
        logger.detail('Crowdfund Address', crowdfundAddress);

        // Get the stored crowdfund data
        const crowdfundData = await getCrowdfund(crowdfundAddress);
        if (!crowdfundData) {
            throw new Error(`No stored data found for crowdfund ${crowdfundAddress}`);
        }

        // Get the party contract from the crowdfund
        const crowdfundContract = new ethers.Contract(
            crowdfundAddress,
            require('../contracts/abis/larry/ERC20LaunchCrowdfundImpl.json'),
            provider
        );
        
        // Get the party address
        const partyAddress = await crowdfundContract.party();
        logger.detail('Party Address', partyAddress);

        // Get the party contract to find the token
        const partyContract = new ethers.Contract(
            partyAddress,
            require('../contracts/abis/larry/PartyImpl.json'),
            provider
        );

        // Get the token address from the party contract
        const tokenAddress = await partyContract.getGovernanceToken();
        logger.detail('Token Address', tokenAddress);

        // Update the crowdfund status and token address
        await updateCrowdfundStatus(crowdfundAddress, {
            status: 'finalized',
            tokenAddress
        });

        // Update the Discord message
        await updateLarryPartyMessage(crowdfundData.messageId, { tokenAddress }, discord);

        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();
    } catch (error) {
        const isNetworkError = handleError(error, 'Larry Finalized Handler');
        if (isNetworkError) throw error;
    }
}

module.exports = { handleLarryFinalized }; 