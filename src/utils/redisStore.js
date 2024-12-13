const Redis = require('ioredis');
const logger = require('./logger');

class RedisStore {
    constructor() {
        this.redis = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            if (this.isConnected) return;

            logger.detail('Redis URL:', process.env.REDIS_URL || 'Using default config');

            const url = process.env.REDIS_URL + '?family=0';
            
            this.redis = new Redis(url, {
                maxRetriesPerRequest: 5,
                retryStrategy(times) {
                    const delay = Math.min(times * 100, 3000);
                    logger.detail(`Redis retry attempt ${times}, delay: ${delay}ms`);
                    return delay;
                },
                reconnectOnError(err) {
                    logger.error('Redis reconnect error:', err);
                    return true;
                }
            });
            
            this.redis.on('error', (error) => {
                logger.error('Redis Error:', error);
                this.isConnected = false;
            });

            this.redis.on('connect', () => {
                logger.detail('Redis Connected');
                this.isConnected = true;
            });

            await this.redis.ping();
            this.isConnected = true;
        } catch (error) {
            logger.error('Redis Connection Error:', error);
            this.isConnected = false;
            throw error;
        }
    }

    async disconnect() {
        if (this.redis) {
            await this.redis.quit();
            this.redis = null;
            this.isConnected = false;
        }
    }

    isReady() {
        return this.isConnected && this.redis !== null;
    }
}

module.exports = new RedisStore(); 