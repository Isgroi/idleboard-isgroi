'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROTOM_VERSION = '1.5.0';

function createRotomLoader({ directory, timeoutMs = 12000 } = {}) {
  const registrations = new WeakMap();
  function load(ses) {
    if (registrations.has(ses)) return registrations.get(ses);
    if (!directory || !fs.existsSync(path.join(directory, 'manifest.json'))) {
      const missing = Promise.resolve({ status: 'missing', version: ROTOM_VERSION });
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
      const timer = setTimeout(() => complete({ status: 'error', version: ROTOM_VERSION }), timeoutMs);
      const api = ses.extensions;
      Promise.resolve().then(() => {
        if (typeof api?.loadExtension !== 'function') throw new Error('Extensions unavailable');
        return api.loadExtension(directory, { allowFileAccess: false });
      }).then(extension => {
        if (finished || extension.version !== ROTOM_VERSION || !/^chrome-extension:\/\/[a-p]{32}\/$/.test(extension.url)) {
          try { api.removeExtension(extension.id); } catch {}
          complete({ status: 'error', version: ROTOM_VERSION });
          return;
        }
        complete({ status: 'loaded', version: ROTOM_VERSION, url: extension.url, id: extension.id });
      }).catch(() => complete({ status: 'error', version: ROTOM_VERSION }));
    });
    registrations.set(ses, registration);
    return registration;
  }
  return { load };
}

module.exports = { ROTOM_VERSION, createRotomLoader };
