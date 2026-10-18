'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gameBackgroundThrottling } = require('../app/performance-mode.cjs');

test('version 1.0.9 enables throttling in the main app and keeps a DEV baseline', () => {
  assert.equal(gameBackgroundThrottling({}), true);
  assert.equal(gameBackgroundThrottling({ IDLEBOARD_MODE: 'production', IDLEBOARD_DEV_BACKGROUND_THROTTLING: '0' }), true);
  assert.equal(gameBackgroundThrottling({ IDLEBOARD_MODE: 'development', IDLEBOARD_DEV_BACKGROUND_THROTTLING: '0' }), false);
  assert.equal(gameBackgroundThrottling({ IDLEBOARD_MODE: 'development', IDLEBOARD_DEV_BACKGROUND_THROTTLING: '1' }), true);
});
