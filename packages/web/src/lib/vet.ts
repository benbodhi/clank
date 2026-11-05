import type { Launch } from './types.ts';

export type SignalLevel = 'good' | 'info' | 'caution' | 'danger';

export interface VetSignal {
    level: SignalLevel;
    label: string;
    detail: string;
}

/** At this many launches in 24 hours, a wallet looks like a token factory, not a project. */
const SERIAL_DEPLOYER_THRESHOLD = 5;

const LATIN = /\p{Script=Latin}/u;
const OTHER_LOOKALIKE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}\p{Script=Lisu}\p{Script=Bamum}]/u;

/** Well-known tickers that are commonly copied to pass as the real asset. */
const IMPERSONATED_TICKERS = new Set([
    'USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'BTC', 'WBTC', 'CBBTC', 'CBETH', 'SOL', 'BNB', 'XRP',
    'DOGE', 'SHIB', 'PEPE', 'TRUMP', 'NEAR', 'AAVE', 'UNI', 'LINK', 'BASE', 'CLANKER', 'BANKR', 'DEGEN', 'HIGHER'
]);

/** Mixed scripts, like a Latin "USDT" with an Armenian "S", are a classic disguise. */
export function hasLookalikeCharacters(text: string): boolean {
    return LATIN.test(text) && OTHER_LOOKALIKE_SCRIPT.test(text);
}

function identitySignal(launch: Launch): VetSignal {
    const { identityKind: kind, identityVerified: verified, identityProof: proof } = launch;

    if (verified && kind === 'farcaster') {
        return proof === 'wallet'
            ? { level: 'good', label: 'Deployer proven', detail: "The wallet that signed the deployment is verified on this Farcaster account." }
            : { level: 'good', label: 'Vetted by Clanker', detail: 'A wallet Clanker vets deployed this on behalf of the account shown.' };
    }
    if (verified && kind === 'x' && proof === 'bankr') {
        return { level: 'info', label: 'Linked by Bankr', detail: "Bankr links the deploying wallet to this X account. That shows who launched it, but a handle can still imitate someone else's." };
    }
    if (verified && kind === 'x') {
        return { level: 'good', label: 'Vetted by Clanker', detail: 'A wallet Clanker vets deployed this on behalf of the X account shown.' };
    }
    if (kind === 'linked') {
        return {
            level: 'caution',
            label: 'Unproven link',
            detail: `A known account owns the ${launch.linkedRole ?? 'linked'} wallet, but someone else deployed this. Deployers can name any wallet without its owner's consent.`
        };
    }
    if (kind === 'farcaster' || kind === 'x') {
        return { level: 'caution', label: 'Unverified claim', detail: 'The token claims a social account, but nothing ties the deployer to it. Anyone can claim any account.' };
    }
    if (launch.deployerName) {
        return { level: 'info', label: 'Named wallet', detail: `The deployer holds ${launch.deployerName}, but no social account is linked.` };
    }
    return { level: 'caution', label: 'Anonymous', detail: 'No identity found from any source.' };
}

/** The vetting signals for a launch, most important first. */
export function vetSignals(launch: Launch): VetSignal[] {
    const signals: VetSignal[] = [identitySignal(launch)];

    if (!launch.deployerIsSigner) {
        signals.push({ level: 'caution', label: 'Launched via a contract', detail: "This didn't come from a direct call to Clanker, so the transaction's sender doesn't show who is behind it." });
    }

    if (launch.conflictingFid) {
        signals.push({ level: 'danger', label: 'Conflicting identity', detail: `The token claims FID ${launch.conflictingFid}, but its deployer belongs to a different account.` });
    }
    if (hasLookalikeCharacters(`${launch.name} ${launch.symbol}`)) {
        signals.push({ level: 'danger', label: 'Lookalike characters', detail: 'The name mixes alphabets, a common way to imitate a well-known token.' });
    }
    if (IMPERSONATED_TICKERS.has(launch.symbol.toUpperCase())) {
        signals.push({ level: 'caution', label: 'Copies a known ticker', detail: `$${launch.symbol} is the ticker of an established asset. This is a separate token.` });
    }
    if (launch.actorLaunches24h >= SERIAL_DEPLOYER_THRESHOLD) {
        signals.push({ level: 'caution', label: 'Serial deployer', detail: `This wallet made ${launch.actorLaunches24h} launches in the 24 hours up to this one.` });
    }
    if (launch.platform && !launch.platformTrusted) {
        signals.push({ level: 'info', label: `Claims ${launch.platform}`, detail: 'The platform is self-reported, and this deployer is not on the known list.' });
    }
    return signals;
}
