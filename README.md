# Clanker Bot

A Discord bot that monitors new token deployments on Base through the Clanker contract and sends notifications to a specified Discord channel.

## Features

- 🔍 Monitors new token deployments in real-time
- 📊 Provides detailed token information including:
  - Token name and symbol
  - Contract address with links (Basescan, Dexscreener, Uniswap, Photon)
  - Deployer address with blockchain explorer links
  - Farcaster ID (FID) with profile link and follower count
  - Supply details
  - LP NFT ID with Uniswap position link
  - Launch cast link
- 🏷️ Role pinging for low FID tokens (configurable threshold)
- 🔄 Automatic reconnection with exponential backoff
- 💪 Resilient error handling and logging
- 🛑 Graceful shutdown handling

## Prerequisites

- Node.js v18 or higher
- npm or yarn
- Discord bot token
- Discord channel ID
- Alchemy API key for Base network

## Project Structure

```
project/
├── src/
│   ├── handlers/
│   │   ├── tokenCreatedHandler.js
│   │   └── errorHandler.js
│   ├── services/
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
- `HIGH_FOLLOWER_ROLE`: Discord role ID to ping for high follower accounts

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
- Contract ABIs for interaction
- Event topic hashes

## Error Handling

The bot includes comprehensive error handling:
- Automatic WebSocket reconnection
- Graceful shutdown on process termination
- Detailed error logging with timestamps
- Service health monitoring

## Deployment

The bot can be deployed on platforms like Railway:

1. **Prepare Repository**
   - Push code to GitHub
   - Ensure `.gitignore` includes sensitive files

2. **Deploy on Railway**
   - Create new project from GitHub repo
   - Set environment variables
   - Deploy using `npm start`

## Discord Bot Setup

1. **Create a New Discord Application**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Go to the "Bot" section and click "Add Bot"
   - Under "Privileged Gateway Intents", enable:
     - Server Members Intent
     - Message Content Intent

2. **Get Your Bot Token**
   - In the "Bot" section, click "Reset Token" to reveal your bot token
   - Copy this token - you'll need it for your `.env` file
   - Keep this token secret and never share it

3. **Invite Bot to Your Server**
   - Go to the "OAuth2" section, then "URL Generator"
   - Select the following scopes:
     - `bot`
     - `applications.commands`
   - Select the following bot permissions:
     - `Read Messages/View Channels`
     - `Send Messages`
     - `Embed Links`
     - `Read Message History`
   - Copy the generated URL and open it in a browser
   - Select your server and authorize the bot

4. **Get Channel ID**
   - In Discord, enable Developer Mode (Settings → App Settings → Advanced → Developer Mode)
   - Right-click the channel where you want notifications and click "Copy Channel ID"
   - Add this ID to your `.env` file

5. **Set Up Role for Low FID Alerts** (Optional)
   - Create a new role in your Discord server
   - Right-click the role and click "Copy Role ID"
   - Add this ID to your `.env` file as `LOW_FID_ROLE`

## MEE6 Role Self-Service Setup

1. **Add MEE6 to Your Server**
   - Visit [MEE6's website](https://mee6.xyz/add)
   - Select your server and authorize the bot
   - Grant necessary permissions

2. **Configure Reaction Roles**
   - Go to your server's MEE6 dashboard
   - Navigate to "Reaction Roles" feature
   - Click "Create Reaction Role"
   - Set up the following:
     - Create a new message or use existing
     - Add your Low FID Alert role
     - Choose an emoji (e.g., 🔔)
     - Save configuration

3. **Example Message Format**
```
🚨 **Get Notified About Low FID Token Launches** 🚨

Use the button below to get the role to receive notifications when tokens are launched by users with low Farcaster IDs (FIDs).
```

Now users can simply react to get the role and be notified about low FID token launches!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

I had issues integrating basename resolution because all examples I found in docs are react components. ENS resolution was easy, but seemed to unnecessarily slow down processing. If you can integrate these efficiently, I'd love to display them.

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