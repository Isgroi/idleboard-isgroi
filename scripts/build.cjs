'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');
const output = path.join(distRoot, 'IdleBoard-Isgroi');
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Destino inseguro: ${child}`);
}

function copyIfPresent(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, destination, { recursive: true });
}

if (process.platform !== 'win32') throw new Error('Este build gera o aplicativo Windows e deve ser executado no Windows.');
if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) throw new Error('Electron não instalado. Execute npm ci antes do build.');
const extensionSource = path.join(root, 'app', 'extensions');
if (fs.existsSync(extensionSource) && fs.readdirSync(extensionSource).length) {
  throw new Error('O build público não pode conter arquivos de extensões de terceiros em app/extensions. Instale a extensão apenas na pasta de dados local descrita no README.');
}

assertInside(distRoot, output);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(electronDist, output, { recursive: true });

const originalExecutable = path.join(output, 'electron.exe');
const appExecutable = path.join(output, 'IdleBoard-Isgroi.exe');
fs.renameSync(originalExecutable, appExecutable);
fs.rmSync(path.join(output, 'resources', 'default_app.asar'), { force: true });
fs.cpSync(path.join(root, 'app'), path.join(output, 'resources', 'app'), { recursive: true });

for (const name of ['LEIA-ME.txt', 'ATUALIZAR.txt', 'LICENSE']) {
  const destinationName = name === 'LICENSE' ? 'LICENSE-IdleBoard.txt' : name;
  fs.copyFileSync(path.join(root, name), path.join(output, destinationName));
}

const sourceOutput = path.join(output, 'codigo-fonte');
for (const name of ['app', 'tests', 'scripts']) copyIfPresent(path.join(root, name), path.join(sourceOutput, name));
for (const name of ['package.json', 'package-lock.json', 'README.md', 'LEIA-ME.txt', 'ATUALIZAR.txt', 'LICENSE', '.gitignore', 'IdleBoard-Isgroi.code-workspace']) {
  copyIfPresent(path.join(root, name), path.join(sourceOutput, name));
}

const appPackage = JSON.parse(fs.readFileSync(path.join(root, 'app', 'package.json'), 'utf8'));
const packageInfo = {
  application: 'IdleBoard Isgroi',
  version: appPackage.version,
  platform: 'win32-x64',
  electron: require(path.join(root, 'node_modules', 'electron', 'package.json')).version,
  entrypoint: 'resources/app/main.cjs',
  sourceIncluded: true,
  generatedAt: new Date().toISOString(),
  sessionsIncluded: false,
};
fs.writeFileSync(path.join(output, 'PACKAGE-INFO.json'), `${JSON.stringify(packageInfo, null, 2)}\n`);
fs.writeFileSync(path.join(output, 'version'), `${appPackage.version}\n`);

console.log(`Build concluído: ${output}`);
