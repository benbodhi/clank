const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            const cleanTimestamp = timestamp.split('.')[0] + 'Z';
            return `[${cleanTimestamp}] ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, message }) => {
                    const cleanTimestamp = timestamp.split('.')[0] + 'Z';
                    return `[${cleanTimestamp}] ${message}`;
                })
            )
        })
    ]
});

logger.section = (title) => {
    logger.info('═══════════════════════════════════════════');
    logger.info(title);
};

logger.sectionEnd = () => {
    logger.info('═══════════════════════════════════════════\n');
};

logger.detail = (label, value) => {
    if (value === undefined) {
        logger.info(label);
    } else {
        logger.info(`${label}: ${value}`);
    }
};

logger.timing = (label, ms) => {
    logger.info(`⏱️  ${label}: ${ms}ms`);
};

module.exports = logger; 