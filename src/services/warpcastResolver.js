const { handleError } = require('../handlers/errorHandler');

/**
 * Fetches user data from Warpcast API
 * @param {number|string} fid - Farcaster ID
 * @returns {Promise<Object|null>} User data or null if not found
 */
async function getWarpcastUserData(fid) {
    if (!fid || isNaN(Number(fid))) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ⚠️ Invalid FID provided: ${fid}`);
        return null;
    }

    try {
        const response = await fetch(`https://api.warpcast.com/v2/user-by-fid?fid=${fid}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(`Warpcast API returned ${response.status}: ${data.message || 'Unknown error'}`);
        }
        
        if (data.result?.user) {
            return {
                followerCount: data.result.user.followerCount,
                username: data.result.user.username
            };
        }
        return null;
    } catch (error) {
        handleError(error, 'Warpcast API');
        return null;
    }
}

module.exports = { getWarpcastUserData }; 