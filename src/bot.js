process.env.DEBUG = 'ethers:*';

// Load environment variables first
require('dotenv').config();

// Validate required environment variables
if (!process.env.DISCORD_TOKEN || 
    !process.env.ALCHEMY_API_KEY || 
    !process.env.DISCORD_CLANKER_CHANNEL_ID || 
    !process.env.CLANKFUN_DEPLOYER_ROLE) {
    console.error('Missing required environment variables: DISCORD_TOKEN, ALCHEMY_API_KEY, DISCORD_CLANKER_CHANNEL_ID, or CLANKFUN_DEPLOYER_ROLE');
    process.exit(1);
}

// Third-party dependencies
const ethers = require('ethers');
const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');

// Local imports: config first
const { settings } = require('./config');

// Local imports: handlers
const { handleError } = require('./handlers/errorHandler');
const { handleClankerToken } = require('./handlers/clankerTokenHandler');
const { handlePresaleCreated, handlePresalePurchase } = require('./handlers/presaleHandler');

const logger = require('./utils/logger');

const MAX_RETRIES = 5;

const ClankerContractHelper = require('./contracts/helpers/ClankerContractHelper');

class ClankerBot {
    constructor() {
        this.provider = null;
        this.discord = null;
        this.isReconnecting = false;
        this.isShuttingDown = false;
        this.lastEventTime = Date.now();
        this.healthCheckInterval = null;
        this.reconnectAttempts = 0;
        this.initCount = 0;
        
        this.setupCleanupHandlers();
        this.initialize();
    }

    setupCleanupHandlers() {
        ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
            process.on(signal, async () => {
                logger.info(`\n${signal} received. Starting cleanup...`);
                await this.cleanup(true);
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            logger.error(`Uncaught Exception: ${error.message}`);
            console.error(error);
            await this.cleanup(true);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (error) => {
            logger.error(`Unhandled Rejection: ${error.message}`);
            console.error(error);
            await this.cleanup(true);
        });
    }

    async initialize() {
        if (this.isShuttingDown) return;
        
        try {
            logger.section('🚀 Initializing Bot');

            // Initialize provider with WebSocket
            logger.detail('Starting WebSocket Provider...');
            this.provider = new ethers.WebSocketProvider(
                `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
                {
                    name: 'base',
                    chainId: 8453
                }
            );

            await this.provider.ready;
            logger.detail('✅ Provider Connected');

            // Initialize Discord client
            await this.initializeDiscord();
            logger.detail('✅ Discord client ready');
            logger.sectionEnd();

            // Initialize contract helpers
            logger.section('🔄 Initializing Contract Monitoring');
            this.clankerContracts = new ClankerContractHelper(this.provider);
            logger.detail('✅ All contracts initialized successfully');
            logger.sectionEnd();

            // Verify contracts
            logger.section('🔍 Verifying Contract Deployments');
            await this.verifyContracts();
            logger.detail('✅ All contracts verified successfully');
            logger.sectionEnd();

            // Set up event listeners
            logger.section('🎯 Setting up Event Listeners');
            await this.setupEventListeners();
            logger.detail('✅ All event listeners set up successfully');
            logger.sectionEnd();

            // Start health checks and ping/pong
            logger.section('🔍 Starting Health Checks and Ping/Pong');
            this.startHealthCheck();
            this.startPingPong();
            logger.sectionEnd();

            logger.section('🚀 Bot Initialization Complete');
            logger.detail('👀 We are clanking...');
            logger.sectionEnd();

            this.initCount = 0; // Reset init count on successful initialization

        } catch (error) {
            logger.error(`Initialization error: ${error.message}`);
            console.error('Full error:', error);
            
            if (this.initCount < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, this.initCount), 30000);
                logger.info(`Retrying initialization in ${delay}ms (attempt ${this.initCount}/${MAX_RETRIES})`);
                setTimeout(() => this.initialize(), delay);
            } else {
                logger.error(`Failed to initialize after ${MAX_RETRIES} attempts`);
                process.exit(1);
            }
        }
    }

    async initializeDiscord() {
        return new Promise((resolve, reject) => {
            this.discord = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                ]
            });
            
            this.discord.once('ready', () => {
                resolve();
            });

            this.discord.on('error', (error) => {
                handleError(error, 'Discord Client');
                if (!this.isReconnecting) {
                    this.handleDisconnect();
                }
            });
            
            this.discord.login(process.env.DISCORD_TOKEN).catch(reject);
        });
    }

    async verifyContracts() {
        const contractsToVerify = [
            ['Clanker Factory', this.clankerContracts.clankerFactory],
            ['Clanker Presale', this.clankerContracts.clankerPresale]
        ];

        for (const [name, contract] of contractsToVerify) {
            const code = await this.provider.getCode(contract.target);
            if (code === '0x' || code.length < 10) {
                throw new Error(`${name} contract not found or invalid at ${contract.target}`);
            }
            logger.detail(`${name} verified`, contract.target);
        }
    }

    async setupEventListeners() {
        // Setup Clanker Factory token creation listener
        this.clankerContracts.clankerFactory.on('TokenCreated', 
            async (tokenAddress, positionId, deployer, fid, name, symbol, supply, castHash, event) => {
            try {
                this.lastEventTime = Date.now();
                const wethAddress = await this.clankerContracts.clankerFactory.weth();

                await handleClankerToken({
                    tokenAddress,
                    positionId,
                    deployer,
                    fid,
                    name,
                    symbol,
                    supply,
                    castHash,
                    transactionHash: event.log.transactionHash,
                    event: event.log,
                    provider: this.provider,
                    discord: this.discord,
                    wethAddress
                });
            } catch (error) {
                handleError(error, 'Clanker Factory Event Handler');
            }
        });

        // Setup presale creation listener
        this.clankerContracts.clankerPresale.on('PreSaleCreated',
            async (preSaleId, bpsAvailable, ethPerBps, endTime, deployer, fid, name, symbol, supply, castHash, event) => {
            try {
                this.lastEventTime = Date.now();
                await handlePresaleCreated({
                    preSaleId,
                    bpsAvailable,
                    ethPerBps,
                    endTime,
                    deployer,
                    fid,
                    name,
                    symbol,
                    supply,
                    castHash,
                    event,
                    provider: this.provider,
                    discord: this.discord
                });
            } catch (error) {
                handleError(error, 'Presale Creation Handler');
            }
        });

        // Watch for presale purchases by monitoring transactions
        this.provider.on({
            address: this.clankerContracts.clankerPresale.target,
            topics: [
                ethers.id('buyIntoPreSale(uint256)') // This creates the method signature hash
            ]
        }, async (log) => {
            try {
                this.lastEventTime = Date.now();
                
                // Get the full transaction
                const tx = await this.provider.getTransaction(log.transactionHash);
                const receipt = await this.provider.getTransactionReceipt(log.transactionHash);
                
                // Decode the function data to get presaleId
                const decodedData = this.clankerContracts.clankerPresale.interface.decodeFunctionData(
                    'buyIntoPreSale',
                    tx.data
                );
                
                await handlePresalePurchase({
                    preSaleId: decodedData[0], // First parameter is presaleId
                    buyer: tx.from,
                    ethAmount: tx.value, // Amount of ETH sent
                    event: log,
                    provider: this.provider,
                    discord: this.discord
                });
            } catch (error) {
                handleError(error, 'Presale Purchase Handler');
            }
        });

        // Log setup completion
        logger.detail('Clanker Factory Listeners', '1');
        logger.detail('Presale Contract Listeners', '1');
        logger.detail('Transaction Monitors', '1');
    }

    setupUncaughtHandlers() {
        process.on('uncaughtException', (error) => {
            handleError(error, 'Uncaught Exception');
            if (!this.isShuttingDown) {
                this.handleDisconnect();
            }
        });

        process.on('unhandledRejection', (error) => {
            handleError(error, 'Unhandled Rejection');
            if (!this.isShuttingDown) {
                this.handleDisconnect();
            }
        });
    }

    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            if (this.isShuttingDown || this.isReconnecting) return;

            try {
                // Check WebSocket connection
                if (this.provider?.websocket?.readyState !== 1) {
                    logger.warn('WebSocket not in OPEN state, reconnecting...');
                    await this.handleDisconnect();
                    return;
                }

                // Check Discord connection
                if (!this.discord?.isReady()) {
                    logger.warn('Discord client not ready, reconnecting...');
                    await this.handleDisconnect();
                    return;
                }

                // Check if we've received events recently
                const timeSinceLastEvent = Date.now() - this.lastEventTime;
                if (timeSinceLastEvent > 5 * 60 * 1000) { // 5 minutes
                    logger.warn('No events received recently, checking connection...');
                    await this.provider.getBlockNumber();
                }

            } catch (error) {
                logger.error(`Health check failed: ${error.message}`);
                await this.handleDisconnect();
            }
        }, 30000); // Check every 30 seconds
    }

    async handleDisconnect() {
        if (this.isReconnecting || this.isShuttingDown) return;
        
        this.isReconnecting = true;
        this.reconnectAttempts++;

        logger.warn('Connection lost, attempting to reconnect...');

        try {
            
            await this.cleanup(false);
            this.isShuttingDown = false;
            
            // Wait with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            await new Promise(resolve => setTimeout(resolve, delay));

            await this.initialize();
            
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            logger.info('Successfully reconnected and restored listeners');
        } catch (error) {
            this.isReconnecting = false;
            handleError(error, 'Reconnection Failed');
            
            if (this.reconnectAttempts > 5) {
                logger.error('Too many reconnection attempts, exiting...');
                await this.cleanup(true);
            } else {
                setTimeout(() => this.handleDisconnect(), 5000);
            }
        }
    }

    async cleanup(shouldExit = true) {
        if (this.isShuttingDown) {
            logger.info('Cleanup already in progress...');
            return;
        }
        
        this.isShuttingDown = true;
        logger.info('Shutting down services...');
        
        try {
            // Remove signal handlers first
            ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
                process.removeAllListeners(signal);
            });

            // Remove unhandled rejection handler to prevent logging during cleanup
            process.removeAllListeners('unhandledRejection');
            
            // Clean up factory listeners first
            if (this.clankerContracts?.clankerFactory) {
                this.clankerContracts.clankerFactory.removeAllListeners();
            }
            
            // Clean up presale listeners
            if (this.clankerContracts?.clankerPresale) {
                this.clankerContracts.clankerPresale.removeAllListeners();
            }
            
            // Clean up provider
            if (this.provider) {
                // Remove all event listeners and subscriptions
                this.provider.removeAllListeners();
                if (this.provider.websocket) {
                    this.provider.websocket.removeAllListeners();
                    // Force close the websocket
                    this.provider.websocket.terminate();
                }
                
                // Add a small delay to ensure all cleanup is complete
                await new Promise(resolve => setTimeout(resolve, 500));
                
                try {
                    await this.provider.destroy();
                } catch (error) {
                    // Ignore provider destruction errors during cleanup
                    logger.warn('Provider cleanup error (non-fatal):', error.message);
                }
                this.provider = null;
            }

            // Clean up Discord
            if (this.discord) {
                await this.discord.destroy();
                this.discord = null;
            }

            logger.info('Cleanup completed successfully');

            if (shouldExit) {
                logger.info('Exiting process...');
                process.exit(0);
            }
        } catch (error) {
            logger.error(`Cleanup error: ${error.message}`);
            if (shouldExit) {
                process.exit(1);
            }
        }
    }

    startPingPong() {
        // Send a ping every 30 seconds
        setInterval(() => {
            if (this.provider?.websocket?.readyState === 1) { // 1 = OPEN
                this.provider.websocket.ping();
            }
        }, 30000);

        // Handle pong responses
        if (this.provider?.websocket) {
            this.provider.websocket.on('pong', () => {
                this.lastEventTime = Date.now(); // Update last event time
            });
        }
    }

    setupHttpServer() {
        const port = process.env.PORT || 3000;
        const server = http.createServer((req, res) => {
            res.writeHead(200);
            res.end('Bot is running');
        });
        
        server.listen(port, () => {
            logger.info(`HTTP server listening on port ${port}`);
        });
    }
}

// Start the bot
new ClankerBot(); 