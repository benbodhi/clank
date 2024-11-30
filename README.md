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
- 🛑 Graceful shutdown handling

## Prerequisites

- Node.js v16 or higher
- npm or yarn
- A Discord bot token
- A Discord channel ID
- An Alchemy API key for Base network access

## Project Structure

```
project/
├── src/
│   ├── handlers/
│   │   └── tokenCreatedHandler.js
│   ├── utils/
│   │   ├── nameResolver.js
│   │   ├── discordMessenger.js
│   │   └── errorHandler.js
│   └── bot.js
├── config.js
├── package.json
├── .env
├── .env.example
├── .gitignore
└── README.md
```

## Environment Variables

Copy the `.env.example` file to `.env` and fill in your values:

```
cp .env.example .env
```

Required variables:
- `DISCORD_TOKEN`: Your Discord bot token from the Discord Developer Portal
- `DISCORD_CHANNEL_ID`: The ID of the channel where notifications will be sent
- `ALCHEMY_API_KEY`: Your Alchemy API key for Base network access

Optional variables:
- `LOW_FID_ROLE`: Discord role ID to ping for low FID tokens (if not set, no role pinging will occur)

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/clanker-bot.git
cd clanker-bot
```

2. Install dependencies:
```
npm install
```

3. Set up your environment variables in `.env`

4. Start the bot:
```
npm start
```

## Configuration

The bot uses the following configurations in `config.js`:
- Clanker Contract: `0x9b84fce5dcd9a38d2d01d5d72373f6b6b067c3e1`
- Uniswap V3 Factory: `0x33128a8fc17869897dce68ed026d694621f6fdfd`
- FID Threshold: Configurable value (default: 20000) for role notifications

## Error Handling

The bot includes:
- Automatic WebSocket reconnection with exponential backoff
- Graceful shutdown on process termination
- Comprehensive error logging
- Resilient name resolution fallbacks

## Deployment

The bot is designed to be deployed on platforms like Railway. Make sure to set the required environment variables in your deployment platform.

### Deploying to Railway

1. **Prepare Your Repository**
   - Push your code to GitHub
   - Make sure `.gitignore` includes:
     ```
     node_modules/
     .env
     ```

2. **Sign Up for Railway**
   - Go to [Railway.app](https://railway.app/)
   - Sign in with your GitHub account

3. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

4. **Configure Environment Variables**
   - Go to your project's "Variables" tab
   - Add all variables from your `.env`:
     - DISCORD_TOKEN
     - DISCORD_CHANNEL_ID
     - ALCHEMY_API_KEY
     - LOW_FID_ROLE

5. **Deploy**
   - Railway will automatically deploy when it detects the package.json
   - It will use the `npm start` command defined in package.json

6. **Monitor**
   - Use the "Deployments" tab to monitor builds
   - Use the "Logs" tab to watch your bot's output

*Note: You can use the following in the deploy settings to run the install-prod script:*
```
npm run install-prod && npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

- **Benbodhi**
  - Farcaster: [@benbodhi](https://warpcast.com/benbodhi)
  - Twitter: [@benbodhi](https://twitter.com/benbodhi)
  - GitHub: [@benbodhi](https://github.com/benbodhi)

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for the Base ecosystem
- We love Clanker
- Uses ethers.js for blockchain interaction
- Powered by Discord.js for Discord integration