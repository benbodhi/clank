const ethers = require('ethers');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const config = require('../config');
const { handleTokenCreated } = require('./handlers/tokenCreatedHandler');
const { handleError } = require('./utils/errorHandler');

class ClankerBot {
    constructor() {
        this.initializeDiscord();
        this.initializeProvider();
        this.setupEventListeners();
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

            console.log('WebSocket Provider initialized successfully');
        } catch (error) {
            handleError(error, 'Provider Initialization');
            process.exit(1);
        }
    }

    setupEventListeners() {
        this.clankerContract.on('TokenCreated', 
            (...args) => handleTokenCreated(args, this.provider, this.discord)
        );

        process.on('SIGINT', () => this.cleanup());
        process.on('SIGTERM', () => this.cleanup());
    }

    cleanup() {
        console.log('\nShutting down gracefully...');
        if (this.provider) {
            this.provider.destroy();
        }
        if (this.discord) {
            this.discord.destroy();
        }
        process.exit();
    }
}

new ClankerBot(); 