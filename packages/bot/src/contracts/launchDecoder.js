const { Contract, Interface, formatUnits, getAddress, id } = require('ethers');

// Only the fragments the bot uses. The test suite pins the event hashes against
// the values Clanker publishes at /api/metadata/factories.
const factoryV4 = new Interface([
    'event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)'
]);

const LAUNCH_PARAMS = '(address creator, (address recipient, address admin, uint16 relativeWeightBps, bool isCreator)[] feeSlots, string tokenName, string tokenSymbol, string tokenContractURI, bytes32 creatorSalt, address quoteToken, uint64 expectedConfigVersion, uint64 deadline, bool metadataEditable, string[] metadataKeys, string[] metadataValues, (uint32 buyTaxRate, uint32 sellTaxRate, uint32 creatorAllocationShare, uint32 burnAllocationShare, uint32 dividendAllocationShare, uint32 integratorAllocationShare, uint256 minimumDividendHolding) taxConfiguration, address creatorFeeRecipient, address integratorFeeRecipient, bool antiSnipeEnabled) launchParams';
const factoryV5 = new Interface([
    'event Launched(address indexed token, bytes32 indexed poolId, address indexed originalCreator, address quoteToken, uint256 launchSupply, int24 tickSpacing)',
    `function createLaunch(${LAUNCH_PARAMS}) payable returns (address token, bytes32 poolId)`,
    `function createLaunchAndBuy(${LAUNCH_PARAMS}, (address fundingToken, uint256 amountIn, uint256 minAmountOut, bytes routeData) launchBuyParams) payable returns (address token, bytes32 poolId, uint256 amountOut)`
]);

const tokenV5Abi = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function extraMetadata(string key) view returns (string)'
];
const lockerV4Abi = [
    'function tokenRewards(address token) view returns (tuple(address token, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 positionId, uint256 numPositions, uint16[] rewardBps, address[] rewardAdmins, address[] rewardRecipients))'
];
const hookV5Abi = [
    'function poolFeeSlots(bytes32 poolId) view returns (tuple(address recipient, address admin, uint16 weightBps, bool isCreator)[])',
    'function poolConfig(bytes32 poolId) view returns (bool initialized, bool tokenIsCurrency0, address token, address quoteToken, address currentCreator, address creatorFeeRecipient, tuple(uint32 protocolTaxShare, uint32 minimumProtocolFeeRate, uint32 maximumProtocolFeeRate, address protocolFeeRecipient) protocolFeeConfiguration, tuple(uint32 startTotalFeeRate, uint32 windowSeconds) antiSnipeConfiguration, uint48 launchTime, bool antiSnipeEnabled, address integratorFeeRecipient, address dividend, tuple(uint32 buyTaxRate, uint32 sellTaxRate, uint32 creatorAllocationShare, uint32 burnAllocationShare, uint32 dividendAllocationShare, uint32 integratorAllocationShare, uint256 minimumDividendHolding) taxConfiguration)'
];

const V4_TOPIC = factoryV4.getEvent('TokenCreated').topicHash;
const V5_TOPIC = factoryV5.getEvent('Launched').topicHash;

/** Doppler's Airlock: Create(address asset, address indexed numeraire, address initializer, address poolOrHook). */
const DOPPLER_CREATE_TOPIC = id('Create(address,address,address,address)');

/** v4's TOKEN_SUPPLY is a contract constant, so it isn't in the event. */
const V4_SUPPLY = 100_000_000_000n * 10n ** 18n;

const MAX_CONTEXT_LENGTH = 2048;

/** v5 expresses rates with 100% as 100,000,000. */
const V5_RATE_PER_PERCENT = 1_000_000;

function blockTime(chain, blockNumber) {
    const clock = chain.blockClock;
    return clock ? new Date((clock.genesisTimestamp + clock.secondsPerBlock * blockNumber) * 1000) : null;
}

/** The address and topic filter for a chain's factories. */
function launchFilter(chain) {
    const { v4, v5 } = chain.factories;
    const airlock = chain.dopplerAirlock;
    return {
        addresses: [v4, v5, airlock].filter(Boolean),
        topics: [v4 && V4_TOPIC, v5 && V5_TOPIC, airlock && DOPPLER_CREATE_TOPIC].filter(Boolean)
    };
}

function formatSupply(supply) {
    return BigInt(formatUnits(supply, 18).split('.')[0]).toLocaleString('en-US');
}

function sameAddress(a, b) {
    return Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
}

function baseFields(rawLog, chain) {
    const blockNumber = Number(rawLog.blockNumber);
    return {
        transactionHash: rawLog.transactionHash,
        blockNumber,
        launchedAt: blockTime(chain, blockNumber)
    };
}

function decodeV4(rawLog, chain) {
    const { args } = factoryV4.parseLog({ topics: rawLog.topics, data: rawLog.data });
    return {
        ...baseFields(rawLog, chain),
        version: 'v4',
        tokenAddress: args.tokenAddress,
        // Emitted by the factory as msg.sender: the immediate caller, which can't be forged.
        deployer: args.msgSender,
        deployerIsSigner: true,
        creator: args.tokenAdmin,
        poolId: args.poolId,
        locker: args.locker,
        name: args.tokenName,
        symbol: args.tokenSymbol,
        image: args.tokenImage,
        rawContext: args.tokenContext,
        supply: formatSupply(V4_SUPPLY)
    };
}

function decodeV5(rawLog, chain) {
    const { args } = factoryV5.parseLog({ topics: rawLog.topics, data: rawLog.data });
    return {
        ...baseFields(rawLog, chain),
        version: 'v5',
        tokenAddress: args.token,
        // originalCreator is a launch parameter, not proof of who sent the
        // transaction. The sender comes from the transaction in fetchV5Details.
        deployer: null,
        deployerIsSigner: false,
        creator: args.originalCreator,
        poolId: args.poolId,
        supply: formatSupply(args.launchSupply)
    };
}

/**
 * Decodes a raw log from a Clanker factory. Returns null for anything that isn't
 * a launch from one of this chain's factories, and throws on a malformed log.
 */
function decodeLaunchLog(rawLog, chain) {
    if (rawLog.removed) return null;
    const topic = rawLog.topics?.[0];
    if (topic === V4_TOPIC && sameAddress(rawLog.address, chain.factories.v4)) return decodeV4(rawLog, chain);
    if (topic === V5_TOPIC && sameAddress(rawLog.address, chain.factories.v5)) return decodeV5(rawLog, chain);
    return null;
}

/**
 * The token in a Doppler launch, or null for any other log. This only says a token
 * launched through Doppler: other launchpads use it too, so the caller still has to
 * ask Bankr whether this one is theirs.
 */
function decodeDopplerCreate(rawLog, chain) {
    if (rawLog.removed || rawLog.topics?.[0] !== DOPPLER_CREATE_TOPIC) return null;
    if (!sameAddress(rawLog.address, chain.dopplerAirlock)) return null;
    if (typeof rawLog.data !== 'string' || rawLog.data.length < 66) return null;
    try {
        return getAddress(`0x${rawLog.data.slice(26, 66)}`);
    } catch {
        return null;
    }
}

const dopplerHook = new Interface([
    'event FeeBeneficiariesSet(bytes32 indexed poolId, tuple(address beneficiary, uint96 shares)[] beneficiaries)'
]);
const USER_OPERATION_EVENT = id('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)');
const tokenMetadataAbi = ['function name() view returns (string)', 'function symbol() view returns (string)'];

function matchesBankrFees(rawLog, signature) {
    if (!sameAddress(rawLog.address, signature.hook)) return null;
    let parsed;
    try {
        parsed = dopplerHook.parseLog({ topics: rawLog.topics, data: rawLog.data });
    } catch {
        return null;
    }
    const expected = Object.entries(signature.beneficiaries);
    const actual = parsed?.args.beneficiaries;
    if (!actual || actual.length !== expected.length) return null;
    const matches = expected.every(([wallet, shares]) => actual.some(
        (entry) => entry.beneficiary.toLowerCase() === wallet && entry.shares === shares
    ));
    return matches ? parsed.args.poolId : null;
}

/**
 * Recognises a Bankr launch from its transaction alone, so an alert needn't wait for
 * Bankr's API. Returns null for any other Doppler launch. Bankr launches through account
 * abstraction, where tx.from is a bundler, so the deployer is the operation's sender.
 */
function identifyBankrLaunch(receipt, createLog, chain) {
    const signature = chain.bankrSignature;
    if (!signature || receipt.status !== '0x1') return null;

    let poolId = null;
    for (const rawLog of receipt.logs) {
        poolId = matchesBankrFees(rawLog, signature);
        if (poolId) break;
    }
    if (!poolId) return null;

    const createIndex = receipt.logs.findIndex((rawLog) => rawLog.logIndex === createLog.logIndex);
    const operation = receipt.logs.slice(createIndex + 1).find((rawLog) => rawLog.topics[0] === USER_OPERATION_EVENT);
    const sender = operation ? `0x${operation.topics[2].slice(26)}` : receipt.from;
    return { poolId, deployer: getAddress(sender) };
}

/** A token's name and symbol, read from the chain. */
async function readTokenMetadata(tokenAddress, provider) {
    const token = new Contract(tokenAddress, tokenMetadataAbi, provider);
    const [name, symbol] = await Promise.all([token.name(), token.symbol()]);
    return { name, symbol };
}

/** The launch's parameters from its calldata, or null if it isn't a known launch call. */
function parseLaunchParams(data) {
    const parsed = factoryV5.parseTransaction({ data });
    if (!parsed) return null;
    const params = parsed.args.launchParams;
    const metadata = (key) => {
        const index = params.metadataKeys.indexOf(key);
        return index === -1 ? '' : params.metadataValues[index];
    };
    return {
        name: params.tokenName,
        symbol: params.tokenSymbol,
        image: metadata('image'),
        rawContext: metadata('context'),
        buyTaxPercent: Number(params.taxConfiguration.buyTaxRate) / V5_RATE_PER_PERCENT,
        sellTaxPercent: Number(params.taxConfiguration.sellTaxRate) / V5_RATE_PER_PERCENT
    };
}

async function readV5State(launch, provider, chain) {
    const token = new Contract(launch.tokenAddress, tokenV5Abi, provider);
    const hook = new Contract(chain.factories.v5Hook, hookV5Abi, provider);
    const [name, symbol, image, rawContext, pool] = await Promise.all([
        token.name(),
        token.symbol(),
        token.extraMetadata('image'),
        token.extraMetadata('context'),
        hook.poolConfig(launch.poolId)
    ]);
    return {
        name,
        symbol,
        image,
        rawContext,
        buyTaxPercent: Number(pool.taxConfiguration.buyTaxRate) / V5_RATE_PER_PERCENT,
        sellTaxPercent: Number(pool.taxConfiguration.sellTaxRate) / V5_RATE_PER_PERCENT
    };
}

/**
 * v5's event omits the name, image and context, so they come from the transaction.
 *
 * The calldata is what was launched, and it can't change. The token's stored context
 * can: its creator may rewrite it afterwards, so it's never used as evidence.
 *
 * tx.from only proves who launched the token if they called the factory directly.
 * Through another contract, it could be someone tricked into signing a "claim" that
 * launches a token in their name, so that sender is treated as proving nothing.
 */
async function fetchV5Details(launch, provider, chain) {
    const tx = await provider.getTransaction(launch.transactionHash);
    if (!tx) throw new Error(`Transaction not found yet: ${launch.transactionHash}`);

    const params = sameAddress(tx.to, chain.factories.v5) ? parseLaunchParams(tx.data) : null;
    if (params) return { ...params, deployer: getAddress(tx.from), deployerIsSigner: true };

    return { ...await readV5State(launch, provider, chain), deployer: getAddress(tx.from), deployerIsSigner: false };
}

/**
 * Who receives the trading fees, largest share first. The deployer chooses these
 * freely, so they show where the money goes but not who's behind a token.
 */
async function fetchFeeRecipients(launch, provider, chain) {
    if (launch.version === 'v5') {
        const hook = new Contract(chain.factories.v5Hook, hookV5Abi, provider);
        const slots = await hook.poolFeeSlots(launch.poolId);
        return sortByShare(slots.map((slot) => ({ wallet: slot.recipient, bps: Number(slot.weightBps) })));
    }
    const locker = new Contract(launch.locker, lockerV4Abi, provider);
    const rewards = await locker.tokenRewards(launch.tokenAddress);
    return sortByShare(rewards.rewardRecipients.map((wallet, index) => ({
        wallet,
        bps: Number(rewards.rewardBps[index])
    })));
}

function sortByShare(recipients) {
    return recipients.sort((a, b) => b.bps - a.bps);
}

/** Parses the self-reported social context. Never throws: it's attacker-controlled. */
function parseContext(rawContext) {
    const empty = { interface: '', platform: '', id: '', messageId: '', username: '' };
    if (typeof rawContext !== 'string' || !rawContext || rawContext.length > MAX_CONTEXT_LENGTH) {
        return empty;
    }
    try {
        const parsed = JSON.parse(rawContext);
        if (parsed === null || typeof parsed !== 'object') return empty;
        const text = (value) => (typeof value === 'string' ? value.trim() : '');
        return {
            interface: text(parsed.interface),
            platform: text(parsed.platform).toLowerCase(),
            id: text(parsed.id),
            messageId: text(parsed.messageId),
            username: text(parsed.username)
        };
    } catch {
        return empty;
    }
}

module.exports = {
    V4_TOPIC,
    V5_TOPIC,
    DOPPLER_CREATE_TOPIC,
    blockTime,
    decodeDopplerCreate,
    identifyBankrLaunch,
    readTokenMetadata,
    launchFilter,
    decodeLaunchLog,
    parseLaunchParams,
    fetchV5Details,
    fetchFeeRecipients,
    parseContext
};
