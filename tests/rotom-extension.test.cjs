'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRotomLoader } = require('../app/rotom-extension.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'idleboard-rotom-test-'));
fs.writeFileSync(path.join(directory, 'manifest.json'), '{}');

test('missing Rotom remains optional', async () => {
  const loader = createRotomLoader({ directory: path.join(directory, 'absent') });
  assert.equal((await loader.load({})).status, 'missing');
});

test('Rotom registers once for each persistent game session', async () => {
  let calls = 0;
  const loader = createRotomLoader({ directory });
  const ses = { extensions: { loadExtension: async () => {
    calls += 1;
    return { id: 'a'.repeat(32), version: '1.5.0', url: `chrome-extension://${'a'.repeat(32)}/` };
  } } };
  const first = await loader.load(ses);
  assert.equal(first.status, 'loaded');
  assert.equal(first.url, `chrome-extension://${'a'.repeat(32)}/`);
  assert.equal((await loader.load(ses)).status, 'loaded');
  assert.equal(calls, 1);
});

test('unexpected Rotom version is removed', async () => {
  const removed = [];
  const loader = createRotomLoader({ directory });
  const result = await loader.load({ extensions: {
    loadExtension: async () => ({ id: 'old', version: '0.0.1', url: `chrome-extension://${'a'.repeat(32)}/` }),
    removeExtension: id => removed.push(id),
  } });
  assert.equal(result.status, 'error');
  assert.deepEqual(removed, ['old']);
});
