const logger = require('./logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Failures a retry can't fix: bad data from the chain (such as invalid UTF-8 in a
 * token name), and Discord rejecting a message. Rate limits aren't included.
 */
function isPermanent(error) {
    if (error?.permanent || error?.code === 'INVALID_ARGUMENT') return true;
    return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.status !== 429;
}

/** Runs `task`, retrying transient failures after each delay in `delaysMs`. */
async function withRetries(task, { label, delaysMs = [2000, 5000, 15000] }) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await task();
        } catch (error) {
            if (attempt >= delaysMs.length || isPermanent(error)) throw error;
            logger.warn(`${label}: attempt ${attempt + 1} failed (${error.message}), retrying`);
            await sleep(delaysMs[attempt]);
        }
    }
}

module.exports = { withRetries, isPermanent, sleep };
