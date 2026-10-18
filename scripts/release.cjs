'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'app', 'package.json'), 'utf8')).version;
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (version !== packageVersion) throw new Error(`Versões diferentes: app=${version}, projeto=${packageVersion}.`);
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A versão deve seguir o formato MAJOR.MINOR.PATCH.');

const git = (args, options = {}) => spawnSync('git', args, { cwd: root, encoding: 'utf8', ...options });
const repoCheck = git(['rev-parse', '--is-inside-work-tree']);
if (repoCheck.status !== 0) throw new Error('O projeto precisa estar em um repositório Git antes de criar uma release.');
const status = git(['status', '--porcelain']);
if (status.status !== 0 || status.stdout.trim()) throw new Error('Faça commit das alterações antes de executar npm run release.');
const tagName = `v${version}`;
const existingTag = git(['rev-list', '-n', '1', tagName]);
const head = git(['rev-parse', 'HEAD']);
if (head.status !== 0) throw new Error(head.stderr || 'Não foi possível identificar o commit atual.');
if (existingTag.status === 0 && existingTag.stdout.trim() !== head.stdout.trim()) throw new Error(`A tag ${tagName} já existe em outro commit.`);

const source = path.join(root, 'dist', 'IdleBoard-Isgroi');
if (!fs.existsSync(path.join(source, 'IdleBoard-Isgroi.exe'))) throw new Error('Build não encontrado. Execute npm run build.');

const releaseRoot = path.join(root, 'releases');
const releaseDirectory = path.join(releaseRoot, `v${version}`);
const archive = path.join(releaseDirectory, `IdleBoard-Isgroi-v${version}-Windows-x64.zip`);
const relative = path.relative(releaseRoot, releaseDirectory);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Destino de release inseguro.');
if (fs.existsSync(archive)) throw new Error(`O pacote ${archive} já existe. Preserve-o ou escolha outra versão.`);
fs.mkdirSync(releaseDirectory, { recursive: true });

const zip = spawnSync('tar.exe', ['-a', '-c', '-f', archive, '-C', path.dirname(source), path.basename(source)], { cwd: root, encoding: 'utf8' });
if (zip.status !== 0) throw new Error(zip.stderr || zip.stdout || 'Não foi possível criar o ZIP.');

if (existingTag.status !== 0) {
  const tag = git(['tag', '-a', tagName, '-m', `Release ${tagName}`]);
  if (tag.status !== 0) throw new Error(tag.stderr || `Não foi possível criar a tag ${tagName}.`);
}

console.log(`Release concluída: ${archive}`);
console.log(`Tag pronta: ${tagName}`);
console.log('Para publicar: git push origin HEAD --follow-tags');
