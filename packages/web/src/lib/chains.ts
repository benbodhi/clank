import 'server-only';

export interface ChainInfo {
    id: number;
    key: string;
    name: string;
    explorerName: string;
    explorerUrl: string;
}

const BASE: ChainInfo = { id: 8453, key: 'base', name: 'Base', explorerName: 'Basescan', explorerUrl: 'https://basescan.org' };

/** Elysium's details weren't published when this was written, so they come from the environment. */
function elysium(): ChainInfo | null {
    const id = Number(process.env.ELYSIUM_CHAIN_ID);
    const explorerUrl = process.env.ELYSIUM_EXPLORER_URL?.trim().replace(/\/$/, '');
    if (!Number.isSafeInteger(id) || id <= 0 || !explorerUrl?.startsWith('https://')) return null;
    return { id, key: 'elysium', name: 'Elysium', explorerName: 'Explorer', explorerUrl };
}

function chains(): ChainInfo[] {
    const extra = elysium();
    return extra ? [BASE, extra] : [BASE];
}

export function chainById(id: number): ChainInfo | null {
    return chains().find((chain) => chain.id === id) ?? null;
}

export function chainByKey(key: string): ChainInfo | null {
    return chains().find((chain) => chain.key === key) ?? null;
}
