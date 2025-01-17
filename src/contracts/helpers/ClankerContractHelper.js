const { ethers } = require('ethers');
const addresses = require('../addresses.json');
const { validateAddresses } = require('../utils');
const logger = require('../../utils/logger');

class ClankerContractHelper {
    constructor(provider) {
        this.provider = provider;
        validateAddresses(addresses.clanker);
        
        this.clankerFactory = new ethers.Contract(
            addresses.clanker.factory,
            require('../abis/clanker/ClankerFactoryV3.json'),
            provider
        );
        logger.detail('Initialized Factory', addresses.clanker.factory);

        this.clankerPresale = new ethers.Contract(
            addresses.clanker.presale,
            require('../abis/clanker/ClankerPreSale.json'),
            provider
        );
        logger.detail('Initialized Presale', addresses.clanker.presale);
    }

    async isPositionLocked(positionId) {
        try {
            return await this.clankerFactory.getLockedPosition(positionId);
        } catch (error) {
            logger.error(`Error checking position lock: ${error.message}`);
            return false;
        }
    }

    getTokenContract(address) {
        return new ethers.Contract(
            address,
            require('../abis/token/Token.json'),
            this.provider
        );
    }
}

module.exports = ClankerContractHelper; 