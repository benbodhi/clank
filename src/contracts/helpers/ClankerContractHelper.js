const { ethers } = require('ethers');
const addresses = require('../addresses.json');
const { validateAddresses } = require('../utils');

class ClankerContractHelper {
    constructor(provider) {
        this.provider = provider;
        validateAddresses(addresses.clanker);
        
        this.clankerFactory = new ethers.Contract(
            addresses.clanker.factory,
            require('../abis/clanker/ClankerFactory.json'),
            provider
        );
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