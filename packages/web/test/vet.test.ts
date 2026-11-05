import assert from 'node:assert/strict';
import test from 'node:test';
import { hasLookalikeCharacters, vetSignals } from '../src/lib/vet.ts';
import { decodeCursor, encodeCursor, escapeLike, isAddress, parseFilter, parseLimit } from '../src/lib/validate.ts';
import { researchLinks, tokenPath, tradeLinks } from '../src/lib/links.ts';
import type { Launch } from '../src/lib/types.ts';

const ADDRESS = '0x67661325031f98417e8101D1d5B34A48A5fdCCCC';

const base: Launch = {
    source: 'clanker',
    chainId: 8453, chainKey: 'base', chainName: 'Base', explorerName: 'Basescan', explorerUrl: 'https://basescan.org',
    tokenAddress: ADDRESS, version: 'v4', txHash: '0x1', launchedAt: '2026-11-05T00:00:00.000Z',
    name: 'Token', symbol: 'TKN', imageUrl: null, poolId: null, supply: null, buyTaxPercent: null, sellTaxPercent: null,
    deployer: ADDRESS, deployerIsSigner: true, deployerVetted: false, deployerName: null, creator: null, feeRecipients: [],
    interfaceName: null, platform: null, platformTrusted: false,
    identityKind: 'none', identityVerified: false, identityProof: null, fid: null, farcasterUsername: null,
    followerCount: null, xHandle: null, xPostUrl: null, castHash: null, linkedRole: null, linkedWallet: null,
    conflictingFid: null, actorLaunches24h: 1
};

const labels = (launch: Launch) => vetSignals({ ...base, ...launch }).map((signal) => signal.label);

test('spots the homoglyph tokens seen on Base', () => {
    assert.equal(hasLookalikeCharacters('UՏDT'), true);
    assert.equal(hasLookalikeCharacters('USDT'), false);
    assert.equal(hasLookalikeCharacters('Привет'), false, 'one alphabet alone is fine');
});

test('an unproven link is a caution, never a pass', () => {
    const signals = vetSignals({ ...base, identityKind: 'linked', linkedRole: 'admin', fid: 20 });
    assert.equal(signals[0].level, 'caution');
});

test('only proven identities get a good signal', () => {
    assert.equal(vetSignals({ ...base, identityKind: 'farcaster', identityVerified: true, identityProof: 'wallet', fid: 3 })[0].level, 'good');
    assert.equal(vetSignals({ ...base, identityKind: 'farcaster', fid: 3 })[0].level, 'caution');
    assert.equal(vetSignals(base)[0].level, 'caution');
});

test('flags serial deployers, copied tickers and conflicting identities', () => {
    assert.ok(labels({ ...base, actorLaunches24h: 5 }).includes('Serial deployer'));
    assert.ok(!labels({ ...base, actorLaunches24h: 4 }).includes('Serial deployer'));
    assert.ok(labels({ ...base, symbol: 'usdc' }).includes('Copies a known ticker'));
    assert.ok(labels({ ...base, conflictingFid: 99 }).includes('Conflicting identity'));
});

test('a launch through another contract is flagged', () => {
    assert.ok(labels({ ...base, deployerIsSigner: false }).includes('Launched via a contract'));
});

test('Buy links stay on Base-only venues only for Base', () => {
    assert.equal(tradeLinks(base)[0]?.label, 'Uniswap');
    const elysium = { ...base, chainKey: 'elysium', explorerName: 'Explorer', explorerUrl: 'https://explorer.example' };
    assert.deepEqual(tradeLinks(elysium).map((link) => link.label), ['Clanker']);
    assert.equal(researchLinks(elysium)[0]?.href, `https://explorer.example/token/${ADDRESS}`);
    assert.equal(tokenPath(elysium), `/token/elysium/${ADDRESS}`);
});

test('Bankr launches lead with Bankr, and never link to Clanker', () => {
    const bankr = { ...base, source: 'bankr' as const };
    assert.deepEqual(tradeLinks(bankr).map((link) => link.label), ['Bankr', 'Uniswap', 'Matcha']);
    const robinhood = { ...bankr, chainKey: 'robinhood', explorerName: 'Explorer', explorerUrl: 'https://robin.etherscan.io' };
    assert.deepEqual(tradeLinks(robinhood).map((link) => link.label), ['Bankr']);
});

test('a Bankr-linked handle is informational, not a pass', () => {
    assert.equal(vetSignals({ ...base, source: 'bankr', identityKind: 'x', identityVerified: true, identityProof: 'bankr', xHandle: 'a' })[0]?.level, 'info');
});

test('input validation rejects malformed values', () => {
    assert.equal(isAddress(ADDRESS), true);
    assert.equal(isAddress("0x'; DROP TABLE launches;--"), false);
    assert.equal(parseFilter('nonsense'), 'identified');
    assert.equal(parseLimit('999'), 60);
    assert.equal(parseLimit('-1'), 30);
    assert.equal(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
});

test('cursors round-trip, and malformed ones are ignored', () => {
    const cursor = { launchedAt: '2026-11-05T00:00:00.000Z', tokenAddress: ADDRESS };
    assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
    assert.equal(decodeCursor('garbage'), null);
    assert.equal(decodeCursor(Buffer.from("x|'; DROP").toString('base64url')), null);
    assert.equal(decodeCursor(null), null);
});
