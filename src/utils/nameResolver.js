const { JsonRpcProvider } = require('ethers');
const { handleError } = require('./errorHandler');

async function resolveNames(address, provider) {
    try {
        const baseName = await provider.lookupAddress(address);
        if (!baseName) {
            const ethProvider = new JsonRpcProvider('https://eth.llamarpc.com');
            const ensName = await ethProvider.lookupAddress(address);
            return ensName || null;
        }
        return baseName;
    } catch (error) {
        handleError(error, 'Name Resolution');
        return null;
    }
}

module.exports = { resolveNames }; 