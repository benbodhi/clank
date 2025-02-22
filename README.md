# Clank

A Discord bot that monitors new token deployments on Base through the Clanker Factory contract, sending notifications to specified Discord channels with role tagging.

## Features

- 🔍 Monitors in real-time:
  - Clanker Factory token deployments
  - Clanker Presale launches
  - Presale contributions
  - Clank.fun deployments
- 📊 Provides detailed information including:
  - Token deployments:
    - Name and symbol
    - Contract address with organized links:
      - First line: Basescan, Dexscreener, GeckoTerminal
      - Second line: Photon, Uniswap, Clank.fun
    - Deployer address with blockchain explorer links
    - Farcaster ID (FID) with profile link and follower count
    - Supply details
    - LP NFT ID with Uniswap position link
    - Launch cast link
  - Presale launches:
    - Token details and supply
    - Available supply percentage
    - Presale goal in ETH
    - Example purchase tiers
    - End time countdown
    - Direct link to Clanker World presale page
  - Presale contributions:
    - Buyer address
    - ETH amount
    - BPS purchased
    - Transaction details
- 🏷️ Role pinging system:
  - Clank.fun deployment notifications
  - Low FID notifications (configurable threshold)
  - High follower count notifications
  - Multiple threshold levels for fine-grained alerts
- 🔄 Reliability Features:
  - Automatic WebSocket reconnection with exponential backoff
  - Resilient error handling and logging
  - Graceful shutdown handling
  - Service health monitoring (checks every minute, logs every 15 minutes)
- 🧠 Smart Filtering:
  - Distinguishes between Farcaster and Clank.fun deployments
  - Avoids notifications for Clankers deployed by 0-follower accounts
  - Configurable thresholds for notifications
- 🎨 Visual Indicators:
  - Orange embeds for Clank.fun deployments
  - Green embeds for low FID deployments
  - Purple embeds for high follower deployments
  - Blue embeds for standard deployments
  - Yellow embeds for presale launches
  - Green embeds for presale contributions

## Prerequisites

- Node.js v18 or higher
- npm or yarn
- Discord bot token
- Discord channel ID
- Alchemy API key for Base network with:
  - Webhooks enabled
  - WebSockets enabled
  - Debug API enabled

## Alchemy Setup

1. Create a new app for Base network in your Alchemy dashboard
2. Enable required features:
   - **WebSockets** - Required for real-time event monitoring
   - **Webhooks** - For real-time notifications
   - **Debug API** - For transaction and event tracing
3. Copy your API key to use in the environment variables

## Project Structure

```
clank/
├── src/
│   ├── config/
│   │   ├── index.js
│   │   └── settings.js
│   ├── contracts/
│   │   ├── abis/
│   │   │   ├── clanker/
│   │   │   │   ├── ClankerFactory.json
│   │   │   │   ├── ClankerFactoryV2.json
│   │   │   │   ├── ClankerFactoryV3.json
│   │   │   │   └── ClankerPreSale.json
│   │   │   ├── token/
│   │   │   │   └── Token.json
│   │   │   └── uniswap/
│   │   │       └── Factory.json
│   │   ├── helpers/
│   │   │   └── ClankerContractHelper.js
│   │   ├── addresses.json
│   │   └── utils.js
│   ├── handlers/
│   │   ├── clankerTokenHandler.js
│   │   └── errorHandler.js
│   ├── services/
│   │   └── warpcastResolver.js
│   ├── utils/
│   │   ├── discordMessenger.js
│   │   └── logger.js
│   └── bot.js
├── .env
├── .env.example
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
```

## Configuration

The bot's configuration is split into multiple files:

### Application Settings
- `src/config/settings.js`: Core application settings including:
  - FID Thresholds for role notifications
  - Follower Thresholds for role notifications
  - Features toggles (e.g., `displayImages`)

### Contract Configuration
- `src/contracts/addresses.json`: Contract addresses for:
  - Clanker Factory
  - Uniswap V3 Factory

### Message Templates
- `src/utils/discordMessenger.js`: Discord message formatting for:
  - Clanker token deployments
  - Embedded message layouts

## Environment Variables

### Required Core Variables
- `ALCHEMY_API_KEY`: Alchemy API key for Base network
- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_CLANKER_CHANNEL_ID`: Channel ID for Clanker notifications

### Role System Variables
The bot uses a tiered notification system with cascading roles:

**FID Roles** (cascade downward)
- `FID_BELOW_1000_ROLE` 🔥
- `FID_BELOW_5000_ROLE` 👀
- `FID_BELOW_10000_ROLE` 📊

**Follower Roles** (cascade upward)
- `FOLLOWERS_OVER_5000_ROLE` 📈
- `FOLLOWERS_OVER_10000_ROLE` ✨
- `FOLLOWERS_OVER_20000_ROLE` ⭐
- `FOLLOWERS_OVER_50000_ROLE` 💫
- `FOLLOWERS_OVER_100000_ROLE` 🚀
- `FOLLOWERS_OVER_200000_ROLE` 🌟

**Platform Role**
- `CLANKFUN_DEPLOYER_ROLE` 🤖

Copy `.env.example` to `.env` and fill in your values.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/benbodhi/clank.git
cd clank
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables in `.env`

4. Start the bot:
```bash
npm start
```

## Error Handling

The bot includes comprehensive error handling:
- Automatic WebSocket reconnection
- Detailed error logging with timestamps
- Graceful shutdown handling
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

3. **Role Setup**
   - Enable Developer Mode in Discord (User Settings > App Settings > Advanced)
   - Create the roles listed in the Environment Variables section above
   - Right-click each role and "Copy ID" to get the role IDs
   - Add these IDs to your `.env` file
   - Ensure the bot's role is higher than all notification roles

4. **Invite Bot to Server**
   - Go to OAuth2 > URL Generator
   - Select the following scopes:
     - `bot`
     - `applications.commands`
   - Select the following bot permissions:
     - `Read Messages/View Channels`
     - `Read Message History`
     - `Send Messages`
     - `Embed Links`
     - `Mention Everyone` (for role pings)
   - Copy the generated URL and open it in a browser
   - Select your server and authorize the bot

5. **Configure Channel**
   - Create or select a channel for notifications
   - Right-click the channel and copy the ID
   - Add this ID to your environment variables

6. **Bot Permissions**
   Ensure the bot has the following permissions in the notification channel:
   - View Channel
   - Send Messages
   - Embed Links
   - Mention Roles

7. **Role Hierarchy**
   - Ensure the bot's role is higher than all notification roles in the server settings
   - This allows the bot to mention these roles in messages

### Role Behavior

- **FID Roles**: Only triggers the highest applicable role (e.g., FID 800 only triggers Below 1,000 role 🔥)
- **Follower Roles**: Only triggers the highest applicable role (e.g., 120k followers only triggers Over 100,000 role 🚀)
- **Platform Role**: Independent of other thresholds, only triggers for clank.fun deployments with orange embed color

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

Now users can simply react to get the roles and be notified about token launches by casters who meet the desired thresholds!

## Role Selection Guide

### Understanding Notifications
The bot automatically tags all relevant roles for each new token. This means:

**For FID Thresholds:**
- If a token has FID 800, it will notify:
  - Below 1,000 role 🔥 (because 800 < 1,000)
  - Below 5,000 role 👀 (because 800 < 5,000)
  - Below 10,000 role 📊 (because 800 < 10,000)

**For Follower Thresholds:**
- If a creator has 120k followers, it will notify:
  - Over 100,000 role 🚀 (because 120k > 100k)
  - Over 50,000 role 💫 (because 120k > 50k)
  - Over 20,000 role ⭐ (because 120k > 20k)
  - Over 10,000 role ✨ (because 120k > 10k)
  - Over 5,000 role 📈 (because 120k > 5k)

**For Platform Deployments:**
- If a token is deployed through clank.fun:
  - Clank.fun deployer role 🤖
  - FID and follower notifications are not triggered
  - Displays orange embed color

### Available Roles
**FID Thresholds:**
- Below 1,000 🔥
- Below 5,000 👀
- Below 10,000 📊

**Follower Thresholds:**
- Over 5,000 📈
- Over 10,000 ✨
- Over 20,000 ⭐
- Over 50,000 💫
- Over 100,000 🚀
- Over 200,000 🌟

**Platform:**
- Clank.fun Deployer 🤖

### Selecting Your Roles
1. **For FID notifications:**
   - Select roles for the FID ranges you want to monitor
   - You'll get notifications for all FIDs BELOW your selected numbers
   - Example: "Below 5k" role will notify you about FIDs 1-4,999

2. **For follower notifications:**
   - Select roles for the follower counts you want to monitor
   - You'll get notifications for all accounts ABOVE your selected numbers
   - Example: "Over 20k" role will notify you about accounts with 20k+ followers

3. **For platform notifications:**
   - Select the clank.fun role to get notifications for all tokens deployed through clank.fun
   - These notifications are independent of FID/follower thresholds

4. **Want multiple?**
   - Select any combination of roles
   - You'll get notifications when ANY of your selected conditions are met

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

I had issues integrating basename resolution because all examples I found in docs are react components. ENS resolution was easy, but seemed to unnecessarily slow down processing. If you can integrate these efficiently, I'd love to display them.

## Author

**Benbodhi**
- Farcaster: [@benbodhi](https://warpcast.com/benbodhi)
- Twitter: [@benbodhi](https://twitter.com/benbodhi)
- GitHub: [@benbodhi](https://github.com/benbodhi)

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built for the Base ecosystem
- We love Base
- We love Clanker
- We love Warpcast
- We love Discord

**We is just me btw*

Powered By:
- Ethers.js v6 for blockchain interaction
- Discord.js for Discord integration
- Warpcast API for Farcaster data
- Winston for structured logging
- Alchemy for WebSocket provider
- MEE6 for role management integration
- Uniswap V3 for trading interface
- Photon for faster trading interface
- Dexscreener for market data links
- Basescan & Etherscan for blockchain explorer links