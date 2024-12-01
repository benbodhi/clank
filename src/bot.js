const ethers = require('ethers');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const config = require('../config');
const { handleTokenCreated } = require('./handlers/tokenCreatedHandler');
const { handleError } = require('./utils/errorHandler');

class ClankerBot {
    constructor() {
        this.lastEventTime = Date.now();
        this.initializeDiscord();
        this.initializeProvider();
        this.setupEventListeners();
        this.startHeartbeat();
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
            console.log('Discord bot is ready!');
            console.log(`Listening for new token deployments from contract at address: ${config.clankerContract}`);
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

    initializeProvider() {
        try {
            this.provider = new ethers.WebSocketProvider(
                `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
            );
            
            this.clankerContract = new ethers.Contract(
                config.clankerContract, 
                config.clankerAbi, 
                this.provider
            );

            // Update lastEventTime when we receive any event
            this.provider.on('block', () => {
                this.lastEventTime = Date.now();
            });

            console.log('WebSocket Provider initialized successfully');
        } catch (error) {
            handleError(error, 'Provider Initialization');
            // Wait 30 seconds before trying again
            setTimeout(() => this.initializeProvider(), 30000);
        }
    }

    setupEventListeners() {
        this.clankerContract.on('TokenCreated', async (...args) => {
            this.lastEventTime = Date.now();
            await handleTokenCreated(args, this.provider, this.discord);
        });

        process.on('SIGINT', () => this.cleanup());
        process.on('SIGTERM', () => this.cleanup());
        
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
        // Check connection health every 5 minutes
        setInterval(() => {
            const now = Date.now();
            const minutesSinceLastEvent = (now - this.lastEventTime) / (1000 * 60);
            const lastEventTimestamp = new Date(this.lastEventTime).toISOString();
            
            // If no events received in 15 minutes, reinitialize
            if (minutesSinceLastEvent > 15) {
                console.log(`No events received since ${lastEventTimestamp}. Reinitializing services...`);
                this.reinitializeServices();
            }

            // Log health check
            console.log(`Health check: Last event at ${lastEventTimestamp}`);
            
        }, 5 * 60 * 1000); // 5 minutes
    }

    async reinitializeServices() {
        console.log('Reinitializing all services...');
        try {
            await this.cleanup(false); // Don't exit process
            this.initializeDiscord();
            this.initializeProvider();
            this.setupEventListeners();
        } catch (error) {
            handleError(error, 'Services Reinitialization');
            // Wait 30 seconds before trying again
            setTimeout(() => this.reinitializeServices(), 30000);
        }
    }

    async cleanup(shouldExit = true) {
        console.log('\nShutting down services...');
        try {
            if (this.provider) {
                await this.provider.destroy();
            }
            if (this.discord) {
                await this.discord.destroy();
            }
            if (shouldExit) {
                process.exit();
            }
        } catch (error) {
            handleError(error, 'Cleanup');
            if (shouldExit) {
                process.exit(1);
            }
        }
    }
}

new ClankerBot(); 