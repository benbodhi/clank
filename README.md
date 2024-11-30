# Clanker Bot

A Discord bot that monitors new token deployments on Base through the Clanker contract and sends notifications to a specified Discord channel.

## Features

- 🔍 Monitors new token deployments in real-time
- 📊 Provides detailed token information including:
  - Token name and symbol
  - Contract address
  - Deployer information
  - Farcaster ID (FID)
  - Supply details
  - LP NFT ID
  - Locker address
  - Associated links (Basescan, Dexscreener, Uniswap, etc.)
- 🔗 Automatically generates relevant links for:
  - Token contract on Basescan
  - Dexscreener
  - Trade on Uniswap
  - Trade on Photon
  - LP position on Uniswap
  - Deployer address on Basescan
  - Farcaster profile
  - Launch cast on Warpcast
- 🏷️ Role pinging for low FID tokens (configurable threshold)
- 👤 ENS and Base name resolution for deployer addresses
- 🔄 Automatic WebSocket reconnection handling
- 🛑 Graceful shutdown on SIGINT

## Prerequisites

- Node.js v16 or higher
- npm or yarn
- A Discord bot token
- A Discord channel ID
- An Alchemy API key for Base network access

## Environment Variables

Create a `.env` file in the root directory with the following variables:

DISCORD_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_channel_id
ALCHEMY_API_KEY=your_alchemy_api_key
LOW_FID_ROLE=your_discord_role_id  # Optional: for pinging on low FID tokens

## Installation

1. Clone the repository:
git clone https://github.com/yourusername/clanker-bot.git
cd clanker-bot

2. Install dependencies:
npm install

3. Set up your environment variables in `.env`

4. Start the bot:
node bot.js

## Configuration

The bot uses the following contract addresses:
- Clanker Contract: `0x9b84fce5dcd9a38d2d01d5d72373f6b6b067c3e1`
- Uniswap V3 Factory: `0x33128a8fc17869897dce68ed026d694621f6fdfd`

You can configure the FID threshold for role pinging in `config.js` (default: 20000)

## Deployment

The bot is designed to be deployed on platforms like Railway. Make sure to set the required environment variables in your deployment platform.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for the Base ecosystem
- Uses ethers.js for blockchain interaction
- Powered by Discord.js for Discord integration
