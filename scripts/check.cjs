'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = [
  'app/main.cjs', 'app/preload.cjs', 'app/game-preload.cjs',
  'app/performance-mode.cjs', 'app/rotom-extension.cjs',
  'app/ui/app.js', 'app/ui/preview.js',
  'scripts/build.cjs', 'scripts/release.cjs',
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${files.length} arquivos JavaScript verificados.`);
