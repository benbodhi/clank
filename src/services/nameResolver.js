const { ethers } = require('ethers');
const { handleError } = require('../handlers/errorHandler');

/**
 * Returns a checksummed address
 * @param {string} address - Ethereum address
 * @returns {Promise<{address: string}>} Checksummed address
 */
async function resolveNames(address) {
    if (!address) {
        return { address };
    }

    try {
        return { address: ethers.getAddress(address) };
    } catch (error) {
        handleError(error, 'Address Resolution');
        return { address };
    }
}

module.exports = { resolveNames }; 