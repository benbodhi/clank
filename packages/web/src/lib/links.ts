import type { Launch } from './types.ts';

type Link = { label: string; href: string };
type ChainRef = Pick<Launch, 'source' | 'chainKey' | 'tokenAddress' | 'poolId' | 'explorerUrl' | 'explorerName'>;

export const tokenPath = ({ chainKey, tokenAddress }: Pick<Launch, 'chainKey' | 'tokenAddress'>) =>
    `/token/${chainKey}/${tokenAddress}`;

/** Places to buy, best first. Each launchpad's own page is the only link known to work everywhere. */
export function tradeLinks({ source, chainKey, tokenAddress: token }: ChainRef): Link[] {
    const home = source === 'bankr'
        ? { label: 'Bankr', href: `https://bankr.bot/trade/${token}` }
        : { label: 'Clanker', href: `https://www.clanker.world/clanker/${token}` };
    if (chainKey !== 'base') return [home];

    const dexes = [
        { label: 'Uniswap', href: `https://app.uniswap.org/swap?chain=base&outputCurrency=${token}` },
        { label: 'Matcha', href: `https://matcha.xyz/tokens/base/${token}` }
    ];
    return source === 'bankr' ? [home, ...dexes] : [...dexes, home];
}

export function researchLinks({ chainKey, tokenAddress: token, poolId, explorerUrl, explorerName }: ChainRef): Link[] {
    const explorer = { label: explorerName, href: `${explorerUrl}/token/${token}` };
    if (chainKey !== 'base') return [explorer];
    return [
        explorer,
        { label: 'Dexscreener', href: `https://dexscreener.com/base/${token}` },
        { label: 'Defined', href: `https://www.defined.fi/base/${token}` },
        ...(poolId ? [{ label: 'GeckoTerminal', href: `https://www.geckoterminal.com/base/pools/${poolId}` }] : [])
    ];
}

export const walletUrl = (launch: Pick<Launch, 'explorerUrl'>, address: string) => `${launch.explorerUrl}/address/${address}`;
export const txUrl = (launch: Pick<Launch, 'explorerUrl' | 'txHash'>) => `${launch.explorerUrl}/tx/${launch.txHash}`;
export const farcasterUrl = (fid: number) => `https://farcaster.xyz/~/profiles/${fid}`;
export const castUrl = (hash: string) => `https://farcaster.xyz/~/conversations/${hash}`;
export const xUrl = (handle: string) => `https://x.com/${handle}`;
