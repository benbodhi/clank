# Clanker Bot

A Discord bot that monitors new token deployments on Base through the Clanker contract and sends notifications to a specified Discord channel.

## Features

- 🔍 Monitors new token deployments in real-time
- 📊 Provides detailed token information including:
  - Token name and symbol
  - Contract address with links (Basescan, Dexscreener, Uniswap, Photon)
  - Deployer information (Base name, ENS, address)
  - Farcaster ID (FID) with profile link and follower count
  - Supply details
  - LP NFT ID with Uniswap position link
  - Launch cast link
- 🏷️ Role pinging for low FID tokens (configurable threshold)
- 👤 Name resolution priority:
  - Base name
  - ENS name
  - Raw address
- 🔄 Automatic reconnection with exponential backoff
- 💪 Resilient error handling and logging
- 🛑 Graceful shutdown handling

## Prerequisites

- Node.js v18 or higher
- npm or yarn
- Discord bot token
- Discord channel ID
- Alchemy API key for Base network access

## Project Structure

```
project/
├── src/
│   ├── handlers/
│   │   ├── tokenCreatedHandler.js
│   │   └── errorHandler.js
│   ├── services/
│   │   ├── nameResolver.js
│   │   └── warpcastResolver.js
│   ├── utils/
│   │   └── discordMessenger.js
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
- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_CHANNEL_ID`: Channel ID for notifications
- `ALCHEMY_API_KEY`: Alchemy API key for Base network
- `LOW_FID_ROLE`: Discord role ID to ping for low FID tokens

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

The bot's configuration is managed in `config.js`:
- FID Threshold: Configurable value for role notifications
- Contract Addresses:
  - Clanker Contract
  - Uniswap V3 Factory
  - Base Name Registrar
- Contract ABIs for interaction
- Event topic hashes

## Error Handling

The bot includes comprehensive error handling:
- Automatic WebSocket reconnection
- Graceful shutdown on process termination
- Detailed error logging with timestamps
- Service health monitoring
- Fallback mechanisms for name resolution

## Deployment

The bot can be deployed on platforms like Railway:

1. **Prepare Repository**
   - Push code to GitHub
   - Ensure `.gitignore` includes sensitive files

2. **Deploy on Railway**
   - Create new project from GitHub repo
   - Set environment variables
   - Deploy using `npm start`

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
- Uses ethers.js v6 for blockchain interaction
- Powered by Discord.js for Discord integration