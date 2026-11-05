export type IdentityKind = 'farcaster' | 'x' | 'linked' | 'none';

export interface FeeRecipient {
    wallet: string;
    bps: number;
}

export interface Launch {
    chainId: number;
    chainKey: string;
    chainName: string;
    explorerName: string;
    explorerUrl: string;
    tokenAddress: string;
    version: string;
    txHash: string;
    launchedAt: string;
    name: string;
    symbol: string;
    imageUrl: string | null;
    poolId: string | null;
    supply: string | null;
    buyTaxPercent: number | null;
    sellTaxPercent: number | null;
    deployer: string;
    /** False when launched through another contract, so the sender proves nothing. */
    deployerIsSigner: boolean;
    deployerVetted: boolean;
    deployerName: string | null;
    creator: string | null;
    feeRecipients: FeeRecipient[];
    interfaceName: string | null;
    platform: string | null;
    platformTrusted: boolean;
    identityKind: IdentityKind;
    identityVerified: boolean;
    identityProof: string | null;
    fid: number | null;
    farcasterUsername: string | null;
    followerCount: number | null;
    xHandle: string | null;
    xPostUrl: string | null;
    castHash: string | null;
    linkedRole: string | null;
    linkedWallet: string | null;
    conflictingFid: number | null;
    /** Launches by the same wallet in the 24 hours up to this one, including this one. */
    actorLaunches24h: number;
}

export type FeedFilter = 'identified' | 'proven' | 'all';

export interface LaunchPage {
    launches: Launch[];
    nextCursor: string | null;
}

export interface MarketData {
    marketCap: number | null;
    priceUsd: number | null;
    volume24h: number | null;
    priceChange1h: number | null;
    warnings: string[];
}
