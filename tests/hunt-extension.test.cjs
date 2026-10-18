'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHuntLoader } = require('../app/hunt-extension.cjs');

test('disabled Hunt never calls extension APIs', async () => {
  const loader = createHuntLoader({ enabled: false });
  const result = await loader.load({ get extensions() { throw new Error('must not touch this API'); } });
  assert.equal(result.status, 'disabled');
});

test('missing API and rejected registration produce a usable failure state', async () => {
  const loader = createHuntLoader();
  assert.equal((await loader.load({})).status, 'error');
  const result = await loader.load({ extensions: { loadExtension: async () => { throw new Error('private diagnostic path'); } } });
  assert.equal(result.status, 'error');
  assert(!result.error.includes('private diagnostic path'));
});

test('unexpected version is removed instead of silently enabling another payload', async () => {
  const removed = [];
  const loader = createHuntLoader();
  const result = await loader.load({ extensions: {
    loadExtension: async () => ({ id: 'unexpected', version: '9.9.9' }),
    removeExtension: id => removed.push(id),
  } });
  assert.equal(result.status, 'error');
  assert.deepEqual(removed, ['unexpected']);
});

test('timeout frees game startup and removes an extension that registers too late', async () => {
  let finish;
  const removed = [];
  const loader = createHuntLoader({ timeoutMs: 15 });
  const ses = { extensions: {
    loadExtension: () => new Promise(resolve => { finish = resolve; }),
    removeExtension: id => removed.push(id),
  } };
  const result = await loader.load(ses);
  assert.equal(result.status, 'error');
  finish({ id: 'late', version: '1.0.3' });
  await new Promise(setImmediate);
  assert.deepEqual(removed, ['late']);
  assert.equal((await loader.load(ses)).status, 'error');
});
