# Clank

Tracks Clanker and Bankr token launches in real time. See each new token, who's really behind it, and how to vet and buy it, in Discord or on a live web feed.

- **Discord bot:** alerts with role pings, filtered down to launches with an identity
- **Webapp:** a live feed of every launch, with search, vetting signals and trade links

It watches Clanker v4 and v5 on Base, the two factories in use today, and is ready for [Elysium](#adding-elysium) once Clanker's details there are public. v3 is deprecated, and v3 presales have stopped.

Bankr launches through Doppler now. On Base, Clank identifies them from the transaction itself, by the fees going to Bankr's wallets, so alerts are real time. [Bankr's API](https://docs.bankr.bot/token-launching/overview) can take about a minute to catch up, so it fills in the X account and image afterwards by editing the alert. Polling it every 30 seconds catches anything missed, and is the only source for Robinhood Chain and Arbitrum for now. Arc launches aren't tracked yet.

## How it fits together

```
Base (Alchemy) ──> bot ──> Discord
                    │
                    ▼
                 Postgres ──NOTIFY──> web ──SSE──> browsers
```

| Service | Holds | Notes |
| --- | --- | --- |
| `packages/bot` | Alchemy key, Discord token, database write access | Not reachable from the internet |
| `packages/web` | Database URL only, in read-only sessions | Public. A compromise exposes no keys |
| Postgres | Launches and the watcher's position | Without it the bot still runs, Discord-only |

The bot gets each launch from a WebSocket for speed, and from an `eth_getLogs` sweep every 30 seconds to catch anything the socket missed. A dropped connection only costs latency. If Discord or the RPC goes down, alerts wait and retry instead of being lost. After a restart or an outage it catches up on as much as the last 30 minutes, and if the database is down it keeps alerting and writes the rows when it returns.

## Who's behind a token?

Clanker's social context is [not authenticated](https://clanker.gitbook.io/documentation/safety/verifying-the-social-context-of-token-deploys): anyone can claim any FID or X handle. So Clank starts from wallets and treats evidence by how much it proves.

| Evidence | Meaning | Shown as | Pings roles? |
| --- | --- | --- | --- |
| The wallet that called Clanker directly is verified on a Farcaster account | Proven, even with no social context | Proven | Yes |
| A Clanker-vetted wallet deployed for a Farcaster account | Vouched for by Clanker | Vetted | Yes |
| A Clanker-vetted wallet deployed for an X account | Vouched for by Clanker | Vetted | No, there are no X roles |
| An allowlisted platform deployer | Proven, once you list its wallets | Platform | Yes, the platform role |
| The signing wallet has a Basename that resolves back to it | Owns the name, but no social account | Named wallet | No |
| The admin or a fee wallet belongs to a known account | **Not proof.** Deployers can name any wallet without consent | ⚠️ Unproven link | No |
| A social account or platform named in the token's context | **Not proof.** Anyone can claim one | ⚠️ Unverified | No |
| A launch made through another contract | **Not proof of anything.** Someone could be tricked into signing it | ⚠️ Launched via a contract | No |

For v5, the name, image and context come from the original transaction, because a token's creator can edit the stored copies after launch.

The Bankr role pings for every launch in Bankr's own feed. A Clanker token that merely claims to be from Bankr is self-reported, so it gets a warning instead, unless you add its wallet to `deployers` in `packages/bot/src/config/settings.js`. Bankr links each deploying wallet to an X account, so Clank shows that handle, but a handle can still imitate someone else.

## Discord alerts

Every launch is stored for the webapp, while `notify` in `settings.js` decides what reaches Discord:

| Launch | Default | Setting |
| --- | --- | --- |
| Bankr launch | Posted, pings the Bankr role | `bankr.enabled` |
| Proven or vetted Farcaster | Posted, with pings | `zeroFollowerAccounts` also allows accounts with no followers |
| X deployment | Posted | `x` |
| Named wallet | Posted | `namedWallets` |
| Unverified claim or unproven link | Posted, with a warning | `unverifiedClaims` |
| Self-reported platform | Posted, with a warning | `selfReportedPlatforms` |
| Anonymous, about 3 in 4 launches | Not posted | `anonymous` |

To mute specific accounts, add their FIDs to `skippedFids`.

### Roles

- **FID roles** ping for FIDs below the threshold, so FID 800 pings Below 1,000, 5,000 and 10,000.
- **Follower roles** ping at or above the threshold, so 120k followers pings every role from Over 5,000 to Over 100,000.
- **Platform roles** ping on their own, instead of FID and follower roles.

## Webapp

- **Feed:** new launches appear instantly. If you've scrolled down, they wait behind a "new launches" button so cards don't jump.
- **Filters:** Identified (default), Proven, Bankr, or Everything.
- **Search:** by name, ticker, @username, FID or wallet.
- **Vetting signals:** identity, serial deployers, lookalike characters like `UՏDT`, copied tickers, conflicting claims and Clanker's warning tags, plus tax, market cap and every wallet involved.
- **Buying:** links out to Uniswap, Matcha, Clanker or Bankr. The app never touches a wallet.

These are automated checks, not advice. A clean result doesn't make a token safe.

## Setup

You need Node 22.12+, pnpm, a [Discord application](https://discord.com/developers/applications) and an [Alchemy](https://dashboard.alchemy.com) key for Base. The free tier is enough. Postgres is needed for the webapp.

```bash
git clone https://github.com/benbodhi/clank.git
cd clank
pnpm install
cp .env.example .env   # then fill it in
```

| Variable | Used by | Required | Purpose |
| --- | --- | --- | --- |
| `ALCHEMY_API_KEY` | bot | Yes | Base RPC and WebSocket |
| `DISCORD_TOKEN` | bot | Yes | Bot token |
| `DISCORD_CLANKER_CHANNEL_ID` | bot | Yes | Channel for alerts |
| `DATABASE_URL` | bot, web | For the webapp | Postgres connection |
| `WEB_URL` | bot | No | Adds "Vet on Clank" links to alerts |
| `*_ROLE` | bot | No | Role IDs. An unset role just isn't pinged |
| `DRY_RUN` | bot | No | `true` logs alerts instead of posting them |
| `ELYSIUM_*` | bot, web | No | See [Adding Elysium](#adding-elysium) |

```bash
pnpm bot:dry-run   # watch live launches without posting anything
pnpm bot           # the real bot
pnpm web           # the webapp, at http://localhost:3000
pnpm backfill 3    # record the last 3 hours without posting, so the feed has history
pnpm test
```

### Discord

1. In the Developer Portal, create an application and a bot. It needs **no privileged intents**.
2. Invite it with the `bot` scope and these permissions: View Channels, Send Messages, Embed Links.
3. In **Server Settings > Roles**, turn on "Allow anyone to @mention this role" for each role the bot should ping. This is safer than giving the bot Mention Everyone.
4. Enable Developer Mode, then copy the channel and role IDs into `.env`.

On startup, the bot checks its channel access and logs a warning for any role that's missing or can't be pinged. Members can pick their own roles with a tool like MEE6's reaction roles.

## Deploying to Railway

Create a project from this repo with three services:

| Service | Build command | Start command | Variables |
| --- | --- | --- | --- |
| **Postgres** | Railway's Postgres template | | |
| **bot** | Default | `pnpm --filter @clank/bot start` | The bot variables, with `DATABASE_URL` set to `${{Postgres.DATABASE_URL}}` |
| **web** | `pnpm --filter @clank/web build` | `pnpm --filter @clank/web start` | `DATABASE_URL` set to `${{Postgres.DATABASE_URL}}` |

On **web**, generate a domain and set the health check path to `/api/health`. Then set `WEB_URL` on the bot to that domain. To avoid unrelated rebuilds, set watch paths to `packages/bot/**` and `packages/web/**`, plus `pnpm-lock.yaml` on each.

The bot creates the database tables on its first start. Keep `DRY_RUN=true` on the bot until you're ready for real alerts.

Run only one live copy of the bot at a time, or alerts will post twice.

## Adding Elysium

[Elysium](https://kinetiq.xyz/docs/elysium-technical-overview) is Kinetiq's Hyperliquid L2. Clank needs no code change to support it, just these variables once its details are public. Until they're set it stays off, and a partial or invalid setup stops the bot at startup with a message naming what's wrong.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `ELYSIUM_CHAIN_ID` | bot, web | Mainnet chain ID. The bot checks the RPC reports the same one |
| `ELYSIUM_RPC_URL` | bot | HTTPS RPC |
| `ELYSIUM_WS_URL` | bot | Optional WebSocket for lower latency. Without it, launches arrive with the 30-second sweep |
| `ELYSIUM_EXPLORER_URL` | bot, web | Block explorer |
| `ELYSIUM_FACTORY_V4` | bot | Clanker's v4 factory, if deployed there |
| `ELYSIUM_FACTORY_V5`, `ELYSIUM_V5_HOOK` | bot | Clanker's v5 factory and hook, if deployed there |

Clanker lists its factories at `https://www.clanker.world/api/metadata/factories`. Before enabling a factory, check that its `tokenCreated` or `launched` event hash matches `V4_TOPIC` or `V5_TOPIC` in `launchDecoder.js`: a new event format needs a code change, and would otherwise show up as no launches at all.

Each chain runs independently, so a problem on one can't stop alerts from another. Elysium launches get a chain label and link to its explorer and to Clanker, until DEX links are known.

## Usage limits

On Alchemy's free tier, the sweep makes about 4,300 `eth_getLogs` calls a day. That's roughly 8M of the 30M monthly compute units, plus a small amount for token lookups. On a paid plan, raising `watcher.logRangeBlocks` in `settings.js` lowers this.

Clank also reads from Clanker's public API, for wallet-to-profile lookups and market data. If it's down, each launch retries for about 20 seconds, then goes out anyway: only vetted deployers can ping, and without follower counts.

## Project layout

```
packages/
├── bot/
│   ├── migrations/            Database schema
│   ├── src/
│   │   ├── bot.js             Startup and shutdown
│   │   ├── config/            Environment, settings and chains
│   │   ├── contracts/         Log and transaction decoding
│   │   ├── handlers/          Identity resolution and alert decisions
│   │   ├── services/          Log watcher, storage, Clanker API, Basenames
│   │   ├── scripts/           Backfill
│   │   └── utils/             Discord messages, sanitizing, logging
│   └── test/
└── web/
    ├── src/
    │   ├── app/               Pages and API routes
    │   ├── components/        Feed, cards, token page
    │   └── lib/               Queries, vetting signals, validation
    └── test/
```

## Contributing

Contributions are welcome. Please open a pull request.

## Author

**Benbodhi**: [Farcaster](https://farcaster.xyz/benbodhi) · [X](https://x.com/benbodhi) · [GitHub](https://github.com/benbodhi)

## License

MIT. See [LICENSE](LICENSE).
