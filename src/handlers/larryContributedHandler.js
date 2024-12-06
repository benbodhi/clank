const { formatEther, ethers } = require('ethers');
const { updateLarryPartyMessage } = require('../utils/discordMessenger');
const { handleError } = require('./errorHandler');
const { getCrowdfund } = require('../utils/larryCrowdfundStore');
const logger = require('../utils/logger');

async function handleLarryContributed(event, provider, discord) {
    const startTime = Date.now();
    
    try {
        logger.section('💰 New Larry Party Contribution');
        
        const [sender, contributor, amount, delegate] = event.args;
        const crowdfundAddress = event.address;
        
        logger.detail('Crowdfund Address', crowdfundAddress);
        logger.detail('Contributor', contributor);
        logger.detail('Amount', formatEther(amount));
        logger.detail('Transaction', event.transactionHash);

        const crowdfund = await getCrowdfund(crowdfundAddress);
        if (!crowdfund?.messageId) {
            logger.warn('No Discord message found for crowdfund:', crowdfundAddress);
            return;
        }

        const crowdfundContract = new ethers.Contract(
            crowdfundAddress,
            require('../contracts/abis/larry/ERC20LaunchCrowdfundImpl.json'),
            provider
        );

        const [totalContributed, tokenName, tokenSymbol] = await Promise.all([
            crowdfundContract.totalContributed(),
            crowdfundContract.name(),
            crowdfundContract.symbol()
        ]);

        await updateLarryPartyMessage({
            messageId: crowdfund.messageId,
            tokenName,
            tokenSymbol,
            larryUrl: `https://www.larry.club/token/${crowdfundAddress}`,
            newContribution: {
                contributor,
                amount: formatEther(amount),
                totalContributed: formatEther(totalContributed),
                timestamp: Date.now(),
                transactionHash: event.transactionHash
            }
        }, discord);
        
        logger.timing('Total Processing', Date.now() - startTime);
        logger.sectionEnd();
    } catch (error) {
        const isNetworkError = handleError(error, 'Larry Contributed Handler');
        if (isNetworkError) throw error;
    }
}

module.exports = { handleLarryContributed }; 