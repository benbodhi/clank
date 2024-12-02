const ethers = require('ethers');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const config = require('../config');
const { handleTokenCreated } = require('./handlers/tokenCreatedHandler');
const { handleError } = require('./handlers/errorHandler');

class ClankerBot {
    constructor() {
        this.isShuttingDown = false;
        this.initCount = 0;
        this.lastEventTime = Date.now();
        this.isReconnecting = false;
        
        this.setupCleanupHandlers();
        this.initializeServices();
    }

    setupCleanupHandlers() {
        // Ensure clean shutdown on various signals
        ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
            process.on(signal, () => {
                console.log(`\n${signal} received. Cleaning up...`);
                this.cleanup(true);
            });
        });
    }

    async initializeServices() {
        if (this.isShuttingDown) return;
        
        try {
            await this.initializeDiscord();
            await this.initializeProvider();
            this.setupEventListeners();
            this.setupUncaughtHandlers();
            this.startHeartbeat();
        } catch (error) {
            handleError(error, 'Services Initialization');
            if (!this.isReconnecting) {
                setTimeout(() => this.initializeServices(), 30000);
            }
        }
    }

    async cleanup(shouldExit = true) {
        // If already shutting down or completed shutdown, return immediately
        if (this.isShuttingDown) {
            console.log('Cleanup already in progress...');
            return;
        }
        
        this.isShuttingDown = true;
        console.log('\nShutting down services...');
        
        try {
            // Remove signal handlers first
            ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
                process.removeAllListeners(signal);
            });
            
            // Remove all listeners first
            if (this.clankerContract) {
                this.clankerContract.removeAllListeners();
                this.clankerContract = null;
            }
            
            if (this.provider) {
                this.provider.removeAllListeners();
                await this.provider.destroy();
                this.provider = null;
            }

            if (this.discord) {
                await this.discord.destroy();
                this.discord = null;
            }

            if (shouldExit) {
                // Force exit after 3 seconds if normal exit fails
                setTimeout(() => {
                    console.log('Forcing exit...');
                    process.exit(1);
                }, 3000);
                
                process.exit(0);
            }
        } catch (error) {
            handleError(error, 'Cleanup');
            if (shouldExit) {
                process.exit(1);
            }
        }
    }

    async reinitializeServices() {
        if (this.isShuttingDown) return;
        
        console.log('Reinitializing all services...');
        try {
            await this.cleanup(false);
            this.isShuttingDown = false;
            this.initCount = 0;
            await this.initializeServices();
        } catch (error) {
            handleError(error, 'Services Reinitialization');
            // Wait 30 seconds before trying again
            setTimeout(() => this.reinitializeServices(), 30000);
        }
    }

    initializeDiscord() {
        this.discord = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
            ]
        });
        
        this.discord.login(process.env.DISCORD_TOKEN);
        
        this.discord.once('ready', () => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] 🤖 Discord bot is ready!`);
            console.log(`[${timestamp}] 👀 Listening for new token deployments from contract at address: ${config.contracts.clanker}`);
        });

        this.discord.on('error', (error) => {
            handleError(error, 'Discord Client');
            this.reinitializeDiscord();
        });
    }

    async reinitializeDiscord() {
        console.log('Attempting to reinitialize Discord connection...');
        try {
            await this.discord.destroy();
            await this.initializeDiscord();
        } catch (error) {
            handleError(error, 'Discord Reinitialization');
            // Wait 30 seconds before trying again
            setTimeout(() => this.reinitializeDiscord(), 30000);
        }
    }

    async initializeProvider() {
        if (this.isReconnecting) return;
        
        try {
            if (this.provider) {
                this.provider.removeAllListeners();
                await this.provider.destroy();
            }

            this.provider = new ethers.WebSocketProvider(
                `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
            );
            
            // Wait for provider to be ready
            await this.provider.ready;
            
            this.clankerContract = new ethers.Contract(
                config.contracts.clanker, 
                config.abis.clanker, 
                this.provider
            );

            // Setup WebSocket error handling after provider is ready
            if (this.provider._websocket) {
                this.provider._websocket.on('error', (error) => {
                    handleError(error, 'WebSocket Provider');
                    if (!this.isReconnecting) {
                        this.reconnectProvider();
                    }
                });

                this.provider._websocket.on('close', () => {
                    const timestamp = new Date().toISOString();
                    console.log(`[${timestamp}] ⚠️ WebSocket closed, attempting to reconnect...`);
                    if (!this.isReconnecting) {
                        this.reconnectProvider();
                    }
                });
            }

            this.provider.on('block', () => {
                this.lastEventTime = Date.now();
            });

            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] 🔌 WebSocket Provider initialized successfully`);
        } catch (error) {
            handleError(error, 'Provider Initialization');
            if (!this.isReconnecting) {
                this.reconnectProvider();
            }
        }
    }

    async reconnectProvider() {
        if (this.isReconnecting || this.isShuttingDown) return;
        
        this.isReconnecting = true;
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 🔄 Attempting to reconnect WebSocket...`);
        
        try {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            await this.initializeProvider();
            this.isReconnecting = false;
        } catch (error) {
            handleError(error, 'Provider Reconnection');
            this.isReconnecting = false;
            // Try again in 30 seconds
            setTimeout(() => this.reconnectProvider(), 30000);
        }
    }

    setupEventListeners() {
        if (this.clankerContract) {
            this.clankerContract.on('TokenCreated', async (...args) => {
                this.lastEventTime = Date.now();
                await handleTokenCreated(args, this.provider, this.discord);
            });
        }
    }

    setupUncaughtHandlers() {
        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            handleError(error, 'Uncaught Exception');
            this.reinitializeServices();
        });

        process.on('unhandledRejection', (error) => {
            handleError(error, 'Unhandled Rejection');
            this.reinitializeServices();
        });
    }

    startHeartbeat() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastEvent = now - this.lastEventTime;
            
            if (timeSinceLastEvent > 15 * 60 * 1000) { // 15 minutes
                console.log(`[${new Date().toISOString()}] ⚠️ No events received in ${Math.floor(timeSinceLastEvent / 60000)} minutes`);
                this.reinitializeServices();
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
}

new ClankerBot(); 