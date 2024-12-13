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

            const options = {
                host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost',
                port: 6379,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                }
            };

            this.redis = new Redis(process.env.REDIS_URL || options);
            
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