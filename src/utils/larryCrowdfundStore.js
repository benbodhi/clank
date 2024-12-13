const logger = require('./logger');
const redisStore = require('./redisStore');

const CROWDFUND_PREFIX = 'crowdfund:';
const PROCESSED_TX_PREFIX = 'processed_tx:';

async function addCrowdfund(address, messageId) {
    logger.detail('Adding Crowdfund', `${address} (Message: ${messageId})`);
    
    const crowdfundData = {
        messageId,
        status: 'active',
        tokenAddress: null,
        contributions: [],
        totalContributed: '0',
        threadId: null,
        createdAt: Date.now()
    };

    await redisStore.redis.hset(
        `${CROWDFUND_PREFIX}${address}`,
        'data',
        JSON.stringify(crowdfundData)
    );
}

async function getCrowdfund(address) {
    const data = await redisStore.redis.hget(`${CROWDFUND_PREFIX}${address}`, 'data');
    if (!data) {
        logger.warn('Crowdfund not found:', address);
        return null;
    }
    return JSON.parse(data);
}

async function updateCrowdfundStatus(address, { status, tokenAddress }) {
    const crowdfund = await getCrowdfund(address);
    if (!crowdfund) {
        logger.error('No crowdfund found for address:', address);
        throw new Error(`No crowdfund found for address ${address}`);
    }

    logger.detail('Updating Crowdfund Status', `${address} -> ${status}`);
    
    crowdfund.status = status;
    crowdfund.tokenAddress = tokenAddress;
    
    await redisStore.redis.hset(
        `${CROWDFUND_PREFIX}${address}`,
        'data',
        JSON.stringify(crowdfund)
    );
}

async function addContribution(address, contribution) {
    const txKey = `${PROCESSED_TX_PREFIX}${address}:${contribution.transactionHash}`;
    
    // Check if transaction already processed
    const exists = await redisStore.redis.exists(txKey);
    if (exists) {
        logger.detail('Skipping duplicate contribution:', contribution.transactionHash);
        return false;
    }

    const crowdfund = await getCrowdfund(address);
    if (!crowdfund) {
        throw new Error(`No crowdfund found for address ${address}`);
    }

    // Mark transaction as processed
    await redisStore.redis.set(txKey, '1');
    
    // Add contribution to list
    crowdfund.contributions.push(contribution);
    crowdfund.totalContributed = contribution.totalContributed;

    await redisStore.redis.hset(
        `${CROWDFUND_PREFIX}${address}`,
        'data',
        JSON.stringify(crowdfund)
    );

    return true;
}

async function getActiveCrowdfunds() {
    if (!redisStore.isReady()) {
        logger.warn('Redis not ready, returning empty crowdfund list');
        return [];
    }

    const keys = await redisStore.redis.keys(`${CROWDFUND_PREFIX}*`);
    const active = [];

    for (const key of keys) {
        const data = await redisStore.redis.hget(key, 'data');
        if (data) {
            const crowdfund = JSON.parse(data);
            if (crowdfund.status === 'active') {
                active.push({
                    address: key.replace(CROWDFUND_PREFIX, ''),
                    ...crowdfund
                });
            }
        }
    }

    logger.detail('Active Crowdfunds', active.length);
    return active;
}

async function updateThreadId(address, threadId) {
    const crowdfund = await getCrowdfund(address);
    if (!crowdfund) {
        throw new Error(`No crowdfund found for address ${address}`);
    }

    crowdfund.threadId = threadId;
    
    await redisStore.redis.hset(
        `${CROWDFUND_PREFIX}${address}`,
        'data',
        JSON.stringify(crowdfund)
    );
}

module.exports = {
    addCrowdfund,
    getCrowdfund,
    updateCrowdfundStatus,
    addContribution,
    getActiveCrowdfunds,
    updateThreadId
}; 