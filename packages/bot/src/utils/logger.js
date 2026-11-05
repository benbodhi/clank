const winston = require('winston');

const SECRET_VARIABLES = ['ALCHEMY_API_KEY', 'DISCORD_TOKEN', 'DATABASE_URL', 'ELYSIUM_RPC_URL', 'ELYSIUM_WS_URL'];

/**
 * Removes secrets from anything being logged. Provider errors can embed the full
 * RPC URL, which contains the API key, so this runs on every line.
 */
function redact(text) {
    let output = String(text);
    for (const secret of SECRET_VARIABLES.map((name) => process.env[name])) {
        const value = secret?.trim();
        if (value) output = output.split(value).join('[redacted]');
    }
    return output;
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) =>
            redact(`[${timestamp.split('.')[0]}Z] ${level}: ${message}`))
    ),
    transports: [new winston.transports.Console()]
});

/** Logs an error's message and code, with the stack only at debug level. */
logger.failure = (context, error) => {
    const code = error?.code ? ` [${error.code}]` : '';
    logger.error(`${context}: ${error?.message ?? error}${code}`);
    if (error?.stack) logger.debug(error.stack);
};

module.exports = logger;
module.exports.redact = redact;
