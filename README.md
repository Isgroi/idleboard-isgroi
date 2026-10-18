# IdleBoard Isgroi

Aplicativo Windows local para organizar até quatro sessões do PokeIdle em painéis separados.

## Preparação inicial

1. Instale o Node.js 24 ou superior, que já inclui o npm.
2. Abra `IdleBoard-Isgroi.code-workspace` no VS Code.
3. Abra **Terminal > Novo Terminal**.
4. Execute `npm.cmd ci` no PowerShell.

## Fluxo diário

- `npm.cmd run dev`: abre o **IdleBoard Isgroi DEV**, com faixa amarela e dados separados do aplicativo estável.
- `npm.cmd test`: executa os testes automatizados.
- `npm.cmd run build`: valida o JavaScript e gera `dist/IdleBoard-Isgroi/IdleBoard-Isgroi.exe`.
- `npm.cmd run release`: exige o Git limpo, testa, gera o build, cria o ZIP em `releases/v<versão>/` e cria a tag da versão quando necessário. Um ZIP já existente é preservado.

Para publicar os commits e tags depois de configurar o repositório remoto:

```powershell
git push -u origin main
git push origin --tags
```

## Dados privados

O DEV grava preferências, cookies e sessões em `%APPDATA%\IdleBoard Isgroi DEV`. O aplicativo estável continua usando a própria pasta do Electron. Nenhuma dessas pastas fica dentro do repositório.

`dist/`, `releases/`, sessões, cookies, arquivos `.env`, chaves e certificados são ignorados pelo Git.

## Nova versão

Atualize o campo `version` em `package.json` e `app/package.json`, atualize também `package-lock.json` com `npm.cmd install --package-lock-only`, faça o commit e execute `npm.cmd run release`. O comando se recusa a criar uma release a partir de arquivos ainda não commitados.
