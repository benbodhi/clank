const ethers = require('ethers');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const config = require('./config');

// Initialize Discord client
const discord = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

// Discord channel ID where messages will be sent
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
// Discord role ID for pinging on low FID tokens
const LOW_FID_ROLE = process.env.LOW_FID_ROLE;

// Set up the WebSocket provider using Alchemy
const provider = new ethers.WebSocketProvider(`wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
const clankerAddress = config.clankerContract;
const clankerAbi = config.clankerAbi;
const clankerContract = new ethers.Contract(clankerAddress, clankerAbi, provider);

// Discord bot login
discord.login(process.env.DISCORD_TOKEN);

discord.once('ready', () => {
    console.log('Discord bot is ready!');
    console.log(`Listening for new token deployments from contract at address: ${clankerAddress}`);
});

// Function to resolve names (Base first, then ENS)
async function resolveNames(address) {
    try {
        const baseName = await provider.lookupAddress(address);
        if (!baseName) {
            const ethProvider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
            const ensName = await ethProvider.lookupAddress(address);
            return ensName || null;
        }
        return baseName;
    } catch (error) {
        console.error('Error resolving names:', error);
        return null;
    }
}

// Function to send Discord message
async function sendDiscordMessage(tokenData, eventLog) {
    try {
        const channel = await discord.channels.fetch(DISCORD_CHANNEL_ID);
        if (!channel) {
            console.error('❌ Could not find Discord channel');
            return;
        }

        // Get transaction receipt to find pool address
        let poolAddress = '';
        if (eventLog && eventLog.transactionHash) {
            const txReceipt = await provider.getTransactionReceipt(eventLog.transactionHash);
            if (txReceipt) {
                const poolCreatedEvent = txReceipt.logs.find(log => 
                    log.topics[0] === config.poolCreatedTopic
                );
                if (poolCreatedEvent) {
                    poolAddress = '0x' + poolCreatedEvent.data.slice(-40);
                }
            }
        }

        // Resolve names for deployer
        const resolvedName = await resolveNames(tokenData.deployer);
        const deployerField = resolvedName ? 
            `${resolvedName} ([${tokenData.deployer}](https://basescan.org/address/${tokenData.deployer}))` : 
            `[${tokenData.deployer}](https://basescan.org/address/${tokenData.deployer})`;

        // Create the Uniswap trade link with pre-set parameters
        const uniswapTradeLink = `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${tokenData.tokenAddress}&chain=base`;
        
        // Create the Photon link if we have the pool address
        const photonLink = poolAddress ? 
            `| [Photon](https://photon-base.tinyastro.io/en/lp/${poolAddress})` : 
            '';

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🔔 New Token Created!')
            .addFields(
                { name: 'Token Name', value: tokenData.name, inline: true },
                { name: 'Ticker', value: tokenData.symbol, inline: true },
                { 
                    name: 'Contract Address', 
                    value: `${tokenData.tokenAddress}\n**[Basescan](https://basescan.org/token/${tokenData.tokenAddress})** | **[Dexscreener](https://dexscreener.com/base/${tokenData.tokenAddress})** | **[Uniswap](${uniswapTradeLink})** ${poolAddress ? '| **[Photon](https://photon-base.tinyastro.io/en/lp/' + poolAddress + ')**' : ''}`, 
                    inline: false 
                },
                { 
                    name: 'Deployer', 
                    value: deployerField, 
                    inline: false 
                },
                { 
                    name: 'FID', 
                    value: `[${tokenData.fid}](https://warpcast.com/~/profiles/${tokenData.fid})`, 
                    inline: false 
                },
                { 
                    name: 'Cast', 
                    value: `[View Launch Cast](https://warpcast.com/~/conversations/${tokenData.castHash})`, 
                    inline: false 
                },
                { 
                    name: 'Supply', 
                    value: tokenData.supply, 
                    inline: false 
                },
                { 
                    name: 'LP Position', 
                    value: `[NFT ID: ${tokenData.lpNftId}](https://app.uniswap.org/#/pool/${tokenData.lpNftId})`, 
                    inline: false 
                }
            )
            .setTimestamp();

        // Create message content (will include ping if FID is below threshold)
        let messageContent = '';
        if (Number(tokenData.fid) < config.fidThreshold) {
            messageContent = `**<@&${LOW_FID_ROLE}> 👀**\n**FID: ${tokenData.fid}**`;
            embed.setColor('#00de34'); // Green color for low FID tokens
        }

        // Send message
        await channel.send({
            content: messageContent,
            embeds: [embed]
        });

    } catch (error) {
        console.error('❌ Error sending Discord message:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

// Listen for TokenCreated events
clankerContract.on('TokenCreated', async (...args) => {
    try {
        // The event object is the last argument
        const event = args[args.length - 1];
        const [
            tokenAddress,
            lpNftId,
            deployer,
            fid,
            name,
            symbol,
            supply,
            lockerAddress,
            castHash
        ] = args;

        console.log(`\n📝 New token deployment detected: ${name} (${symbol})`);
        console.log(`Token Address: ${tokenAddress}`);
        console.log(`Deployer: ${deployer}`);
        console.log(`FID: ${fid}`);
        
        // Get pool address from transaction receipt
        let poolAddress = '';
        if (event && event.log && event.log.transactionHash) {
            console.log(`Transaction Hash: ${event.log.transactionHash}`);
            const txReceipt = await provider.getTransactionReceipt(event.log.transactionHash);
            if (txReceipt) {
                const poolCreatedLog = txReceipt.logs.find(log => 
                    log.address.toLowerCase() === config.uniswapFactory.toLowerCase()
                );
                if (poolCreatedLog) {
                    poolAddress = '0x' + poolCreatedLog.data.slice(-40);
                    console.log(`Pool Address: ${poolAddress}`);
                } else {
                    console.log('No pool created log found');
                }
            }
        } else {
            console.log('Warning: No transaction hash found in event');
        }

        // Prepare token data for Discord message
        const tokenData = {
            tokenAddress,
            lpNftId,
            deployer,
            fid,
            name,
            symbol,
            supply: ethers.formatUnits(supply, 18),
            lockerAddress,
            castHash,
            poolAddress
        };

        // Send Discord message
        await sendDiscordMessage(tokenData, event.log);
        console.log('✅ Discord notification sent successfully\n');

    } catch (error) {
        console.error('❌ Error processing token creation event:', error.message);
        if (error.stack) console.error(error.stack);
    }
});

// Handle WebSocket provider errors
provider.on('error', (error) => {
    console.error('WebSocket Provider Error:', error);
});

// Add this to keep the process running and clean up on exit
process.on('SIGINT', () => {
    provider.destroy();
    discord.destroy();
    process.exit();
});