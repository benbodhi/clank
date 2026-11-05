const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanText, displayText, safeCastHash, safeImageUrl, safeXHandle, safeXPostUrl } = require('../src/utils/sanitize');
const { redact } = require('../src/utils/logger');

test('cleanText removes control and invisible characters and collapses whitespace', () => {
    assert.equal(cleanText('Uni   　  BTC\n\r'), 'Uni BTC');
    assert.equal(cleanText('a​b‮c'), 'a b c');
    assert.equal(cleanText('x'.repeat(500), 10).length, 10);
});

test('displayText neutralises links, mentions and markdown', () => {
    const rendered = displayText('[Claim](https://evil.example) @everyone <@&123> **x**');
    assert.ok(!rendered.includes('](http'));
    assert.ok(!rendered.includes('https://'));
    assert.ok(!/(^|[^\\])@everyone/.test(rendered));
    assert.ok(!/(^|[^\\])<@&/.test(rendered));
    assert.ok(!/(^|[^\\])\*\*/.test(rendered));
});

test('displayText never returns an empty value', () => {
    assert.equal(displayText(''), '(unnamed)');
    assert.equal(displayText('​\n'), '(unnamed)');
});

test('safeImageUrl allows http(s), maps ipfs and rejects everything else', () => {
    assert.equal(safeImageUrl('https://a.example/i.png'), 'https://a.example/i.png');
    assert.equal(safeImageUrl('ipfs://bafyabc'), 'https://ipfs.io/ipfs/bafyabc');
    assert.equal(safeImageUrl('ipfs://ipfs/bafyabc'), 'https://ipfs.io/ipfs/bafyabc');
    for (const bad of ['', 'javascript:alert(1)', 'data:image/png;base64,AA', 'not a url', 'ipfs://../x', `https://a.example/${'x'.repeat(3000)}`]) {
        assert.equal(safeImageUrl(bad), null, bad);
    }
});

test('an image URL that grows when normalised is rejected', () => {
    assert.equal(safeImageUrl(`https://a.example/${'é'.repeat(1000)}`), null);
});

test('retry classification', () => {
    const { isPermanent } = require('../src/utils/retry');
    assert.equal(isPermanent({ status: 400 }), true);
    assert.equal(isPermanent({ status: 429 }), false);
    assert.equal(isPermanent({ status: 503 }), false);
    assert.equal(isPermanent({ code: 'INVALID_ARGUMENT' }), true, 'invalid UTF-8 from a token');
    assert.equal(isPermanent(new Error('network')), false);
});

test('link helpers only accept the exact expected shapes', () => {
    assert.ok(safeCastHash('0xb9d49014fdc049c1e426d2f1567982726681d328'));
    assert.equal(safeCastHash('0xb9d4) [click](https://evil.example'), null);
    assert.equal(safeXPostUrl('https://x.com/a_b/status/123?s=20'), 'https://x.com/a_b/status/123');
    assert.equal(safeXPostUrl('https://x.com.evil.example/a/status/1'), null);
    assert.equal(safeXPostUrl('http://x.com/a/status/1'), null);
    assert.equal(safeXHandle('@usoil'), 'usoil');
    assert.equal(safeXHandle('@bad handle'), null);
});

test('redact strips secrets from logged text', () => {
    process.env.ALCHEMY_API_KEY = 'secret-key-value';
    assert.equal(redact('wss://x/v2/secret-key-value failed'), 'wss://x/v2/[redacted] failed');
    delete process.env.ALCHEMY_API_KEY;
});
