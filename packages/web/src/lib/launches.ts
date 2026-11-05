import 'server-only';
import { chainById } from './chains';
import { getPool } from './db';
import type { FeedFilter, Launch, LaunchPage } from './types';
import { decodeCursor, encodeCursor, escapeLike, isAddress } from './validate';

const SELECT = `
    SELECT l.*, (
        SELECT count(*)::int FROM launches x
        WHERE x.actor = l.actor
          AND x.launched_at <= l.launched_at
          AND x.launched_at > l.launched_at - interval '24 hours'
    ) AS actor_launches_24h
    FROM launches l`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLaunch(row: any): Launch | null {
    // A row from a chain this deployment isn't configured for has no safe links to show.
    const chain = chainById(Number(row.chain_id));
    if (!chain) return null;

    const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));
    return {
        chainId: chain.id,
        chainKey: chain.key,
        chainName: chain.name,
        explorerName: chain.explorerName,
        explorerUrl: chain.explorerUrl,
        tokenAddress: row.token_address,
        version: row.version,
        txHash: row.tx_hash,
        launchedAt: new Date(row.launched_at).toISOString(),
        name: row.name,
        symbol: row.symbol,
        // The browser only loads images over https, whatever the token set.
        imageUrl: row.image_url?.startsWith('https://') ? row.image_url : null,
        poolId: row.pool_id,
        supply: row.supply,
        buyTaxPercent: toNumber(row.buy_tax_percent),
        sellTaxPercent: toNumber(row.sell_tax_percent),
        deployer: row.deployer,
        deployerIsSigner: row.deployer_is_signer,
        deployerVetted: row.deployer_vetted,
        deployerName: row.deployer_name,
        creator: row.creator,
        feeRecipients: row.fee_recipients ?? [],
        interfaceName: row.interface,
        platform: row.platform,
        platformTrusted: row.platform_trusted,
        identityKind: row.identity_kind,
        identityVerified: row.identity_verified,
        identityProof: row.identity_proof,
        fid: toNumber(row.fid),
        farcasterUsername: row.farcaster_username,
        followerCount: row.follower_count,
        xHandle: row.x_handle,
        xPostUrl: row.x_post_url,
        castHash: row.cast_hash,
        linkedRole: row.linked_role,
        linkedWallet: row.linked_wallet,
        conflictingFid: toNumber(row.conflicting_fid),
        actorLaunches24h: row.actor_launches_24h
    };
}

export interface ListOptions {
    filter: FeedFilter;
    query?: string | null;
    cursor?: string | null;
    limit: number;
}

function searchClause(query: string, params: unknown[]): string {
    if (isAddress(query)) {
        params.push(query.toLowerCase());
        const n = params.length;
        return `(lower(l.token_address) = $${n} OR lower(l.deployer) = $${n} OR l.actor = $${n})`;
    }
    if (/^\d{1,12}$/.test(query)) {
        params.push(Number(query));
        return `l.fid = $${params.length}`;
    }
    params.push(`%${escapeLike(query.replace(/^[@$]/, ''))}%`);
    const n = params.length;
    return `(l.name ILIKE $${n} OR l.symbol ILIKE $${n} OR l.farcaster_username ILIKE $${n} OR l.x_handle ILIKE $${n} OR l.deployer_name ILIKE $${n})`;
}

export async function listLaunches({ filter, query, cursor, limit }: ListOptions): Promise<LaunchPage> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (filter === 'proven') where.push('l.identity_verified');
    if (filter === 'identified') where.push(`l.identity_kind <> 'none'`);

    const position = decodeCursor(cursor ?? null);
    if (position) {
        params.push(position.launchedAt, position.tokenAddress);
        where.push(`(l.launched_at, l.token_address) < ($${params.length - 1}::timestamptz, $${params.length})`);
    }

    const search = query?.trim().slice(0, 100);
    if (search) where.push(searchClause(search, params));

    params.push(limit + 1);
    const sql = `${SELECT}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY l.launched_at DESC, l.token_address DESC
        LIMIT $${params.length}`;

    const { rows } = await getPool().query(sql, params);
    const page = rows.slice(0, limit);
    const launches = page.map(toLaunch).filter((launch): launch is Launch => launch !== null);
    const last = page.at(-1);

    return {
        launches,
        nextCursor: rows.length > limit && last
            ? encodeCursor({ launchedAt: new Date(last.launched_at).toISOString(), tokenAddress: last.token_address })
            : null
    };
}

export async function getLaunch(chainId: number, tokenAddress: string): Promise<Launch | null> {
    if (!Number.isSafeInteger(chainId) || !isAddress(tokenAddress)) return null;
    const { rows } = await getPool().query(
        `${SELECT} WHERE l.chain_id = $1 AND lower(l.token_address) = $2`,
        [chainId, tokenAddress.toLowerCase()]
    );
    return rows[0] ? toLaunch(rows[0]) : null;
}
