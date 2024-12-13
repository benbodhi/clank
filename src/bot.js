process.env.DEBUG = 'ethers:*';

// Load environment variables first
require('dotenv').config();

// Validate required environment variables
if (!process.env.DISCORD_TOKEN || 
    !process.env.ALCHEMY_API_KEY || 
    !process.env.DISCORD_CLANKER_CHANNEL_ID || 
    !process.env.DISCORD_LARRY_CHANNEL_ID) {
    console.error('Missing required environment variables: DISCORD_TOKEN, ALCHEMY_API_KEY, DISCORD_CLANKER_CHANNEL_ID, or DISCORD_LARRY_CHANNEL_ID');
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
const { handleLarryToken } = require('./handlers/larryTokenHandler');
const { handleLarryPartyCreated } = require('./handlers/larryPartyCreatedHandler');
const { handleLarryContributed } = require('./handlers/larryContributedHandler');
const { handlePresaleFinalized, handlePresaleRefunded } = require('./handlers/larryPresaleEventHandlers');

// Local imports: contract helpers
const LarryContractHelper = require('./contracts/helpers/LarryContractHelper');
const ClankerContractHelper = require('./contracts/helpers/ClankerContractHelper');

const logger = require('./utils/logger');
const { getActiveCrowdfunds, addCrowdfund, updateCrowdfundStatus } = require('./utils/larryCrowdfundStore');

const MAX_RETRIES = 5;
const redisStore = require('./utils/redisStore');

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
        this.activeCrowdfundListeners = new Map();
        
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
            
            // Connect to Redis first
            await redisStore.connect();
            logger.detail('Redis Connected');

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
            logger.detail('Provider Connected');

            // Initialize Discord client
            await this.initializeDiscord();
            logger.detail('Discord client ready');
            logger.sectionEnd();

            // Initialize contract helpers
            logger.section('🔄 Initializing Contract Monitoring');
            this.larryContracts = new LarryContractHelper(this.provider);
            this.clankerContracts = new ClankerContractHelper(this.provider);
            
            logger.detail('Clanker Factory', this.clankerContracts.clankerFactory.target);
            logger.detail('Larry Factory', this.larryContracts.larryFactory.target);
            logger.detail('Larry Party Factory', this.larryContracts.partyFactory.target);
            logger.sectionEnd();

            // Verify contracts
            logger.section('🔍 Verifying Contract Deployments');
            await this.verifyContracts();
            logger.detail('✅ All contracts verified successfully');
            logger.sectionEnd();

            // Set up event listeners
            logger.section('🎯 Setting up Event Listeners');
            await this.setupEventListeners();
            logger.detail('Larry Factory Listeners', '1');
            logger.detail('Clanker Factory Listeners', '1');
            logger.sectionEnd();

            // Restore crowdfund listeners
            logger.section('🔄 Restoring Crowdfund Listeners');
            await this.restoreActiveCrowdfundListeners();
            logger.sectionEnd();

            // Start health checks and ping/pong
            this.startHealthCheck();
            this.startPingPong();

            logger.section('🚀 Bot Initialization Complete');
            logger.detail('👀 We are watching...');
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
            ['Larry Factory', this.larryContracts.larryFactory],
            ['Larry Party Factory', this.larryContracts.partyFactory]
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
        // Setup Larry Factory listeners
        this.larryContracts.larryFactory.on('ERC20LaunchCrowdfundCreated', 
            async (creator, crowdfund, party, crowdfundOpts, partyOpts, tokenOpts, event) => {
            try {
                this.lastEventTime = Date.now(); // Update last event time
                await handleLarryPartyCreated({
                    creator,
                    crowdfund,
                    party,
                    crowdfundOpts,
                    partyOpts,
                    tokenOpts,
                    transactionHash: event.log.transactionHash,
                    provider: this.provider,
                    discord: this.discord,
                    bot: this
                });
            } catch (error) {
                handleError(error, 'Larry Factory Event Handler');
            }
        });

        // Setup Clanker Factory listeners
        this.clankerContracts.clankerFactory.on('TokenCreated', 
            async (tokenAddress, positionId, deployer, fid, name, symbol, supply, lockerAddress, castHash, event) => {
            try {
                this.lastEventTime = Date.now(); // Update last event time
                await handleClankerToken({
                    tokenAddress,
                    positionId,
                    deployer,
                    fid,
                    name,
                    symbol,
                    supply,
                    lockerAddress,
                    castHash,
                    event,
                    provider: this.provider,
                    discord: this.discord
                });
            } catch (error) {
                handleError(error, 'Clanker Factory Event Handler');
            }
        });
    }

    async restoreActiveCrowdfundListeners() {
        const activeCrowdfunds = await getActiveCrowdfunds();
        if (activeCrowdfunds.length > 0) {
            logger.detail('Active Crowdfunds', activeCrowdfunds.length);
            for (const { address } of activeCrowdfunds) {
                await this.setupCrowdfundListener(address);
            }
        } else {
            logger.detail('No active crowdfunds found');
        }
    }

    async setupCrowdfundListener(address) {
        const crowdfundContract = new ethers.Contract(
            address,
            require('./contracts/abis/larry/ERC20LaunchCrowdfundImpl.json'),
            this.provider
        );

        // Add to active listeners map
        this.activeCrowdfundListeners.set(address, crowdfundContract);

        // Get past contribution events
        const currentBlock = await this.provider.getBlockNumber();
        const pastEvents = await crowdfundContract.queryFilter('Contributed', currentBlock - 10000, currentBlock);
        
        logger.detail('Past Contributions', `Found ${pastEvents.length} events for ${address}`);
        
        // Process past events
        for (const event of pastEvents) {
            try {
                await handleLarryContributed(event, this.provider, this.discord);
            } catch (error) {
                handleError(error, 'Past Contribution Event Handler');
            }
        }

        // Set up new event listeners
        crowdfundContract.on('Contributed', async (sender, contributor, amount, delegate, event) => {
            try {
                await handleLarryContributed(event, this.provider, this.discord);
            } catch (error) {
                handleError(error, 'Larry Contribution Event Handler');
            }
        });

        // Set up finalize listener
        crowdfundContract.on('Finalized', async (event) => {
            try {
                await handlePresaleFinalized(event, this.provider, this.discord);
                await this.removeCrowdfundListener(address);
            } catch (error) {
                handleError(error, 'Presale Finalized Event Handler');
            }
        });

        // Set up refund listener
        crowdfundContract.on('Refunded', async (event) => {
            try {
                await handlePresaleRefunded(event, this.provider, this.discord);
                await this.removeCrowdfundListener(address);
            } catch (error) {
                handleError(error, 'Presale Refunded Event Handler');
            }
        });
    }

    async removeCrowdfundListener(address) {
        const contract = this.activeCrowdfundListeners.get(address);
        if (contract) {
            contract.removeAllListeners();
            this.activeCrowdfundListeners.delete(address);
            logger.detail('Removed Listeners', address);
        }
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
            // Store current listeners before cleanup
            const currentListeners = new Map(this.activeCrowdfundListeners);
            
            await this.cleanup(false);
            this.isShuttingDown = false;
            
            // Wait with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            await new Promise(resolve => setTimeout(resolve, delay));

            await this.initialize();
            
            // Restore previous listeners
            for (const [address] of currentListeners) {
                await this.setupCrowdfundListener(address);
            }
            
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
            // Disconnect Redis first
            await redisStore.disconnect();
            
            // Remove signal handlers first
            ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
                process.removeAllListeners(signal);
            });
            
            // Clean up crowdfund listeners
            for (const [address, contract] of this.activeCrowdfundListeners) {
                contract.removeAllListeners();
                this.activeCrowdfundListeners.delete(address);
                logger.detail('Removed Listener', address);
            }
            
            // Clean up factory listeners
            if (this.clankerContracts?.clankerFactory) {
                this.clankerContracts.clankerFactory.removeAllListeners();
            }
            
            if (this.larryContracts?.larryFactory) {
                this.larryContracts.larryFactory.removeAllListeners();
            }
            
            // Clean up provider
            if (this.provider) {
                this.provider.removeAllListeners();
                await this.provider.destroy();
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