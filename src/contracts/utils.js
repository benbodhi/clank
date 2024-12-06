const ethers = require('ethers');

function validateAddresses(addresses) {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    Object.entries(addresses).forEach(([name, address]) => {
        if (!addressRegex.test(address)) {
            throw new Error(`Invalid ${name} contract address: ${address}`);
        }
    });
}

module.exports = {
    validateAddresses
}; 