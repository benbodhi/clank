const { ethers } = require('ethers');
const addresses = require('../addresses.json');
const { validateAddresses } = require('../utils');

class LarryContractHelper {
    constructor(provider) {
        this.provider = provider;
        validateAddresses(addresses.larry);
        
        this.larryFactory = new ethers.Contract(
            addresses.larry.factory,
            require('../abis/larry/CrowdfundFactoryImpl.json'),
            provider
        );

        this.partyFactory = new ethers.Contract(
            addresses.larry.partyFactory,
            require('../abis/larry/PartyFactory.json'),
            provider
        );
    }

    getCrowdfundContract(address) {
        return new ethers.Contract(
            address,
            require('../abis/larry/ERC20LaunchCrowdfundImpl.json'),
            this.provider
        );
    }
}

module.exports = LarryContractHelper; 