/**
 * Everything on-chain is attacker-controlled, including token names, tickers,
 * images and social context. These helpers keep it from forging links, mentions
 * or log lines.
 */

/** Strips control and invisible characters, collapses whitespace and truncates. */
function cleanText(value, maxLength = 100) {
    const cleaned = String(value ?? '')
        .normalize('NFC')
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return [...cleaned].slice(0, maxLength).join('');
}

/** Escapes Discord markdown, masked links, autolinks, mentions and emoji shortcodes. */
function escapeDiscord(value) {
    return String(value).replace(/([\\`*_~|[\]()<>#:@/-])/g, '\\$1');
}

/** Clean, escaped text for display, never empty because Discord rejects empty fields. */
function displayText(value, maxLength = 100) {
    return escapeDiscord(cleanText(value, maxLength)) || '(unnamed)';
}

/** An http(s) image URL with ipfs:// mapped to a gateway, or null if unusable. */
function safeImageUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > 2048) return null;

    if (raw.startsWith('ipfs://')) {
        const path = raw.slice('ipfs://'.length).replace(/^ipfs\//, '');
        return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) ? `https://ipfs.io/ipfs/${path}` : null;
    }

    try {
        const url = new URL(raw);
        // Normalising can make a URL much longer, so check the final length too.
        if (url.href.length > 2048) return null;
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
        return null;
    }
}

/** A Farcaster cast hash, or null. */
function safeCastHash(value) {
    return /^0x[0-9a-fA-F]{40}$/.test(String(value ?? '')) ? value : null;
}

/** A canonical link to a post on X, or null. */
function safeXPostUrl(value) {
    const match = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})(?:[/?].*)?$/
        .exec(String(value ?? ''));
    return match ? `https://x.com/${match[1]}/status/${match[2]}` : null;
}

/** The handle in a link to a post on X, or null. */
function xHandleFromPostUrl(value) {
    const url = safeXPostUrl(value);
    return url ? url.split('/')[3] : null;
}

/** An X handle without the @, or null. */
function safeXHandle(value) {
    const match = /^@?([A-Za-z0-9_]{1,15})$/.exec(String(value ?? ''));
    return match ? match[1] : null;
}

module.exports = {
    cleanText,
    escapeDiscord,
    displayText,
    safeImageUrl,
    safeCastHash,
    safeXPostUrl,
    xHandleFromPostUrl,
    safeXHandle
};
