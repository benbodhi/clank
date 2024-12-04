const ethers = require('ethers');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const config = require('../config');
const { handleTokenCreated } = require('./handlers/tokenCreatedHandler');
const { handleError } = require('./handlers/errorHandler');

class ClankerBot {
    constructor() {
        this.provider = null;
        this.discord = null;
        this.lastEventTimestamp = Date.now();
        this.isConnected = false;
    }

    async initializeProvider() {
        try {
            this.provider = new ethers.WebSocketProvider(process.env.WSS_URL);
            await this.provider.getNetwork(); // Test the connection
            console.log('[%s] 🔌 WebSocket Provider initialized successfully', new Date().toISOString());
            this.isConnected = true;
        } catch (error) {
            handleError(error, 'Provider Initialization');
            this.isConnected = false;
            // If initial connection fails, retry after delay
            setTimeout(() => this.initializeProvider(), 30000);
        }
    }

    setupHealthCheck() {
        setInterval(async () => {
            try {
                const now = Date.now();
                const timeSinceLastEvent = now - this.lastEventTimestamp;
                
                // Log if no events for a while (but this is normal)
                if (timeSinceLastEvent > 15 * 60 * 1000) { // 15 minutes
                    console.log(`[${new Date().toISOString()}] ℹ️ No events in ${Math.floor(timeSinceLastEvent / 60000)} minutes - Connection healthy`);
                }

                // Simple connection check
                if (this.provider && this.isConnected) {
                    await this.provider.getBlockNumber(); // Light request to verify connection
                    this.isConnected = true;
                }
            } catch (error) {
                console.log(`[${new Date().toISOString()}] ⚠️ Connection check failed, attempting to reconnect...`);
                this.isConnected = false;
                await this.initializeProvider();
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    async start() {
        try {
            await this.initializeProvider();
            await this.initializeDiscord();
            this.setupEventListeners();
            this.setupHealthCheck();
            this.setupGracefulShutdown();
        } catch (error) {
            handleError(error, 'Bot Startup');
            process.exit(1);
        }
    }

    // ... rest of your existing code ...
}

new ClankerBot(); 