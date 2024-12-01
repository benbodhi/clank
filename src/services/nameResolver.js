const { ethers } = require('ethers');
const { handleError } = require('../handlers/errorHandler');
const config = require('../../config');

/**
 * Resolves an Ethereum address to all available names
 * @param {string} address - Ethereum address to resolve
 * @param {ethers.Provider} provider - Ethers provider instance
 * @returns {Promise<{basename: string|null, ensName: string|null, address: string}>} Resolved names
 */
async function resolveNames(address, provider) {
    if (!address || !provider) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ⚠️ Missing address or provider for name resolution`);
        return { basename: null, ensName: null, address };
    }

    try {
        let basename = null;
        let ensName = null;

        // Try Base name resolution
        const baseRegistrar = new ethers.Contract(
            config.baseRegistrar,
            config.baseRegistrarAbi,
            provider
        );
        
        try {
            const baseName = await baseRegistrar.reverseNameOf(address);
            if (baseName && baseName !== '') {
                basename = baseName;
            }
        } catch (error) {
            // Silently handle Base name resolution failure
        }

        // Try ENS resolution
        try {
            const name = await provider.lookupAddress(address);
            if (name) {
                ensName = name;
            }
        } catch (error) {
            // Silently handle ENS resolution failure
        }

        return { basename, ensName, address };
    } catch (error) {
        handleError(error, 'Name Resolution');
        return { basename: null, ensName: null, address };
    }
}

module.exports = { resolveNames }; 