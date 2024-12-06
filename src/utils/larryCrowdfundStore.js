const logger = require('./logger');

// Using a simple in-memory store for now
const crowdfundStore = new Map();

async function addCrowdfund(address, messageId) {
    logger.detail('Adding Crowdfund', `${address} (Message: ${messageId})`);
    crowdfundStore.set(address, {
        messageId,
        status: 'active',
        tokenAddress: null,
        contributions: [],
        totalContributed: 0
    });
}

async function getCrowdfund(address) {
    const crowdfund = crowdfundStore.get(address);
    if (!crowdfund) {
        logger.warn('Crowdfund not found:', address);
    }
    return crowdfund;
}

async function updateCrowdfundStatus(address, { status, tokenAddress }) {
    const existing = crowdfundStore.get(address);
    if (!existing) {
        logger.error('No crowdfund found for address:', address);
        throw new Error(`No crowdfund found for address ${address}`);
    }

    logger.detail('Updating Crowdfund Status', `${address} -> ${status}`);
    crowdfundStore.set(address, {
        ...existing,
        status,
        tokenAddress
    });
}

async function getActiveCrowdfunds() {
    const active = Array.from(crowdfundStore.entries())
        .filter(([_, data]) => data.status === 'active')
        .map(([address, data]) => ({
            address,
            ...data
        }));
    logger.detail('Active Crowdfunds', active.length);
    return active;
}

module.exports = {
    addCrowdfund,
    getCrowdfund,
    updateCrowdfundStatus,
    getActiveCrowdfunds
}; 