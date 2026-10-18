#!/usr/bin/env python3
"""Package this local app with the checksum-verified official Electron runtime.

No installer or system changes; the runtime archive is supplied explicitly.
"""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ELECTRON_VERSION = '44.9.0'
RUNTIME_SHA256 = '88e08039d0ef359bab9f674e8051fa103bd8628ea7c5a5e1daaa610a8a0c6931'


def sha256(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def add_tree(archive, root, prefix):
    for file in sorted(root.rglob('*')):
        if file.is_file() and '__pycache__' not in file.parts:
            archive.write(file, prefix + '/' + file.relative_to(root).as_posix())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--staging', required=True, type=Path)
    parser.add_argument('--update-output', type=Path, help='Also build a small update for an existing runtime.')
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1]
    extension_source = source / 'app' / 'extensions'
    if extension_source.exists() and any(extension_source.iterdir()):
        raise SystemExit('O pacote público não pode conter arquivos de extensões em app/extensions.')
    if sha256(args.runtime) != RUNTIME_SHA256:
        raise SystemExit('Runtime checksum does not match the official Electron release.')
    stage = args.staging.resolve()
    if stage.exists():
        raise SystemExit('Use a new empty staging directory to avoid replacing files.')
    stage.mkdir(parents=True)
    with zipfile.ZipFile(args.runtime) as runtime:
        for item in runtime.infolist():
            target = (stage / item.filename).resolve()
            if not target.is_relative_to(stage):
                raise SystemExit('Invalid runtime archive member.')
        runtime.extractall(stage)
    (stage / 'electron.exe').rename(stage / 'IdleBoard-Isgroi.exe')
    default = stage / 'resources' / 'default_app.asar'
    if default.exists():
        default.unlink()
    shutil.copytree(source / 'app', stage / 'resources' / 'app')
    for name in ['LEIA-ME.txt', 'ATUALIZAR.txt', 'LICENSE']:
        shutil.copy2(source / name, stage / ('LICENSE-IdleBoard.txt' if name == 'LICENSE' else name))
    code = stage / 'codigo-fonte'
    code.mkdir()
    for name in ['app', 'tests', 'scripts']:
        shutil.copytree(source / name, code / name, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in ['package.json', 'LEIA-ME.txt', 'ATUALIZAR.txt', 'LICENSE']:
        shutil.copy2(source / name, code / name)
    info = {
        'application': 'IdleBoard Isgroi',
        'version': json.loads((source / 'app' / 'package.json').read_text())['version'],
        'platform': 'win32-x64',
        'electron': ELECTRON_VERSION,
        'runtime_sha256': RUNTIME_SHA256,
        'runtime_source': f'https://github.com/electron/electron/releases/download/v{ELECTRON_VERSION}/electron-v{ELECTRON_VERSION}-win32-x64.zip',
        'entrypoint': 'resources/app/main.cjs',
        'optional_extension_bundled': False,
    }
    (stage / 'PACKAGE-INFO.json').write_text(json.dumps(info, indent=2) + '\n')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        add_tree(output, stage, 'IdleBoard-Isgroi')
    print(json.dumps({'file': str(args.output.resolve()), 'bytes': args.output.stat().st_size, 'sha256': sha256(args.output), 'runtime_verified': True}))
    if args.update_output:
        args.update_output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.update_output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as output:
            add_tree(output, stage / 'resources' / 'app', 'resources/app')
            add_tree(output, code, 'codigo-fonte')
            for name in ['LEIA-ME.txt', 'ATUALIZAR.txt', 'LICENSE-IdleBoard.txt', 'PACKAGE-INFO.json']:
                output.write(stage / name, name)
        print(json.dumps({'update_file': str(args.update_output.resolve()), 'bytes': args.update_output.stat().st_size, 'sha256': sha256(args.update_output)}))


if __name__ == '__main__':
    main()
