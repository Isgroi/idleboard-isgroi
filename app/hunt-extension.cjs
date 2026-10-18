'use strict';

const path = require('node:path');
const fs = require('node:fs');

const HUNT_VERSION = '1.0.3';
const FAILURE = 'A Hunt não pôde ser carregada. O jogo continua disponível. Reabra o aplicativo para tentar novamente.';
const MISSING = 'Extensão não instalada neste computador. Veja o README para instalar a /hunt localmente.';

// Extensions belong to an Electron Session. Cache registration for the lifetime
// of this process so reopening a panel keeps its own persistent game storage.
function createHuntLoader({ enabled = true, directory, timeoutMs = 12000 } = {}) {
  const registrations = new WeakMap();
  const disabled = Object.freeze({ status: 'disabled', version: HUNT_VERSION });
  function load(ses) {
    if (!enabled) return Promise.resolve(disabled);
    if (registrations.has(ses)) return registrations.get(ses);
    if (!directory || !fs.existsSync(path.join(directory, 'manifest.json'))) {
      const missing = Promise.resolve({ status: 'missing', version: HUNT_VERSION, error: MISSING });
      registrations.set(ses, missing);
      return missing;
    }
    const registration = new Promise(resolve => {
      let finished = false;
      const complete = result => {
        if (finished) return false;
        finished = true;
        clearTimeout(timer);
        resolve(result);
        return true;
      };
      const timer = setTimeout(() => complete({ status: 'error', version: HUNT_VERSION, error: FAILURE }), timeoutMs);
      const api = ses.extensions;
      Promise.resolve().then(() => {
        if (typeof api?.loadExtension !== 'function') throw new Error('Extensions unavailable');
        return api.loadExtension(directory, { allowFileAccess: false });
      }).then(extension => {
        // A late registration after timeout must not silently activate on a
        // later game navigation while the UI says the extension failed.
        if (finished || extension.version !== HUNT_VERSION) {
          try { api.removeExtension(extension.id); } catch {}
          complete({ status: 'error', version: HUNT_VERSION, error: FAILURE });
          return;
        }
        complete({ status: 'loaded', version: HUNT_VERSION });
      }).catch(() => complete({ status: 'error', version: HUNT_VERSION, error: FAILURE }));
    });
    registrations.set(ses, registration);
    return registration;
  }
  return { enabled, load };
}

module.exports = { HUNT_VERSION, createHuntLoader };
