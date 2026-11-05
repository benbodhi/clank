const test = require('node:test');
const assert = require('node:assert/strict');
const { LaunchStore } = require('../src/services/launchStore');

const record = { chain_id: 8453, token_address: '0xabc', fee_recipients: [] };

function storeWith(query) {
    const store = new LaunchStore('postgres://unused@127.0.0.1:1/none');
    store.pool.query = query;
    store.migrated = true;
    return store;
}

test('a database outage keeps the launch and its posted state, then writes both', async () => {
    let down = true;
    const queries = [];
    const store = storeWith(async (sql) => {
        if (down) throw new Error('connection refused');
        queries.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
        return { rows: [{ posted: false }], rowCount: 1 };
    });

    assert.deepEqual(await store.saveLaunch(record), { alreadyPosted: false }, 'must not block the alert');
    await store.markPosted(record);
    assert.equal(store.pending.size, 1);

    down = false;
    await store.recover();
    assert.equal(store.pending.size, 0);
    assert.deepEqual(queries, ['INSERT INTO', 'UPDATE launches']);
    await store.close();
});

test('recover keeps rows if the database is still down', async () => {
    const store = storeWith(async () => { throw new Error('down'); });
    await store.saveLaunch(record);
    await store.recover();
    assert.equal(store.pending.size, 1);
    await store.close();
});
