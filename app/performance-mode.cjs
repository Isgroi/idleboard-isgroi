'use strict';

// Version 1.0.9 enables throttling in the main app for a real-world trial.
// DEV can still run the original behavior as a side-by-side rollback baseline.
function gameBackgroundThrottling(env) {
  if (env.IDLEBOARD_MODE === 'development') {
    return env.IDLEBOARD_DEV_BACKGROUND_THROTTLING === '1';
  }
  return true;
}

module.exports = { gameBackgroundThrottling };
