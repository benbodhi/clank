/** A small TTL cache. `undefined` from the loader means failure and isn't cached. */
function createTtlCache({ ttlMs, maxEntries }) {
    const entries = new Map();

    return async function cached(key, load) {
        const hit = entries.get(key);
        if (hit && hit.expires > Date.now()) return hit.value;

        const value = await load();
        if (value === undefined) return null;

        entries.delete(key);
        if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
        entries.set(key, { value, expires: Date.now() + ttlMs });
        return value;
    };
}

module.exports = { createTtlCache };
