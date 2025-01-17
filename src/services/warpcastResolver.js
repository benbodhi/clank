const logger = require('../utils/logger');
const { handleError } = require('../handlers/errorHandler');

/**
 * Fetches user data from Warpcast API
 * @param {number|string} fid - Farcaster ID
 * @returns {Promise<Object|null>} User data or null if not found
 */
async function getWarpcastUserData(fid) {
    const startTime = Date.now();
    
    try {
        logger.detail('Fetching Warpcast Data for FID', `${fid}`);
        const response = await fetch(`https://api.warpcast.com/v2/user-by-fid?fid=${fid}`);
        
        if (!response.ok) {
            logger.warn('Warpcast API Error', `Status: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (!data?.result?.user) {
            logger.warn('No user data found for FID:', fid);
            return null;
        }

        const result = {
            username: data.result.user.username,
            displayName: data.result.user.displayName,
            followerCount: data.result.user.followerCount,
            followingCount: data.result.user.followingCount,
            profileImage: data.result.user.pfp?.url
        };

        logger.detail('Warpcast Data Retrieved', `(${result.username}, ${result.followerCount} followers)`);
        logger.timing('Warpcast Data Fetch', Date.now() - startTime);
        
        return result;
    } catch (error) {
        const isNetworkError = handleError(error, 'Warpcast API');
        if (isNetworkError) throw error;
        return null;
    }
}

module.exports = { getWarpcastUserData }; 