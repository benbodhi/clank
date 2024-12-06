const logger = require('../utils/logger');

function isNetworkError(error) {
    const networkErrorPatterns = [
        'network',
        'connection',
        'timeout',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ECONNRESET',
        'ENETUNREACH'
    ];

    return (
        error.code === 'NETWORK_ERROR' ||
        error.code === 'SERVER_ERROR' ||
        networkErrorPatterns.some(pattern => 
            error.message.toLowerCase().includes(pattern)
        ) ||
        error instanceof TypeError && error.message.includes('fetch')
    );
}

function handleError(error, context) {
    logger.error(`Error in ${context}: ${error.message}`);
    
    // Log the full error object for debugging
    console.error('Full error:', error);
    
    if (error.stack) {
        logger.error('Stack:', error.stack);
    }

    return error.code === 'NETWORK_ERROR' || 
           error.message.includes('network') ||
           error.message.includes('connection');
}

module.exports = { handleError }; 