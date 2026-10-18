# IdleBoard Isgroi

## Português (Brasil)

Aplicativo Windows local para organizar até quatro sessões do PokeIdle em painéis separados. O código público não contém a extensão de terceiros `/hunt for PokeIdle`.

**Versão 1.1.0:** cada painel tem um botão **Sniper** que abre o Cockpit da Rotom Sniper 1.5.0 naquela conta. A abertura do Cockpit foi testada no aplicativo principal; regras de compra automática e resultados de mercado não foram validados pelo IdleBoard.

## Preparação inicial

1. Instale o Node.js 24 ou superior, que já inclui o npm.
2. Abra `IdleBoard-Isgroi.code-workspace` no VS Code.
3. Abra **Terminal > Novo Terminal**.
4. Execute `npm.cmd ci` no PowerShell.

## Fluxo diário

- `npm.cmd run dev`: abre o **IdleBoard Isgroi DEV** com a mesma economia de painéis ocultos da versão principal, faixa amarela e dados separados.
- `npm.cmd run dev:baseline`: abre o mesmo DEV com o comportamento anterior, para comparar. Feche uma janela DEV antes de abrir a outra.
- `npm.cmd test`: executa os testes automatizados.
- `npm.cmd run build`: valida o JavaScript e gera `dist/IdleBoard-Isgroi/IdleBoard-Isgroi.exe`.
- `npm.cmd run release`: exige o Git limpo, testa, gera o build, cria o ZIP em `releases/v<versão>/` e cria a tag da versão quando necessário. Um ZIP já existente é preservado.

## Publicação no GitHub

O histórico público foi reconstruído a partir das cópias reais das versões 1.0.0, 1.0.1, 1.0.3, 1.0.5 e 1.0.6. Veja [HISTORICO-PUBLICO.md](HISTORICO-PUBLICO.md): 1.0.2 e 1.0.4 não têm cópia verificada. O histórico privado antigo, que continha a extensão, ficou guardado **fora do projeto**. Não importe nem envie esse histórico e não use `git push --mirror` da cópia antiga.

Para publicar uma alteração futura, confira os arquivos antes de fazer o commit:

```powershell
git status
git add app tests scripts package.json package-lock.json README.md LEIA-ME.txt ATUALIZAR.txt
git diff --cached --name-only
git commit -m "descreva a alteração"
```

Depois, gere o ZIP e publique a branch e **somente** a tag nova:

```powershell
npm.cmd run release
git push origin main
git push origin v1.1.0 # substitua pela tag da próxima versão
```

O ZIP gerado fica em `releases/v<versão>/` e não é enviado automaticamente ao GitHub. Antes de anexá-lo manualmente a uma Release, confira que não contém extensões nem dados pessoais. Não publique os ZIPs históricos originais: alguns contêm extensões. Se algum comando apresentar erro, pare e confira a mensagem antes de continuar.

## Dados privados

O DEV grava preferências, cookies e sessões em `%APPDATA%\IdleBoard Isgroi DEV`. O aplicativo estável continua usando a própria pasta do Electron. Nenhuma dessas pastas fica dentro do repositório.

`dist/`, `releases/`, sessões, cookies, arquivos `.env`, chaves e certificados são ignorados pelo Git.

## Extensão /hunt (opcional e de terceiros)

Eu uso a extensão [**/hunt for PokeIdle**, de Liang, na Chrome Web Store](https://chromewebstore.google.com/detail/hunt-for-pokeidle/mhnplloljgchpfpcpbhmcokmnefodjnh). Ela **não está neste repositório nem no pacote do IdleBoard**. Instale-a somente se quiser e se tiver direito de usá-la; o IdleBoard e o jogo funcionam sem ela. A versão esperada pelo aplicativo é a 1.0.3. Não envie a extensão, seu `.crx` ou uma cópia da sua pasta ao GitHub.

Para usá-la no IdleBoard no seu próprio Windows, se você tiver direito de usá-la:

1. No chat **dentro do PokeIdle**, digite `/guia` e abra o link da extensão no Chrome que o jogo mostrar. Esse comando serve para encontrar o link; **não instala nem ativa a extensão no IdleBoard**. Se o link não aparecer, use diretamente a [página de `/hunt for PokeIdle` na Chrome Web Store](https://chromewebstore.google.com/detail/hunt-for-pokeidle/mhnplloljgchpfpcpbhmcokmnefodjnh). Confira o endereço antes de instalar.
2. Instale a extensão no Chrome, respeitando os termos do autor. Confira em `chrome://extensions` se ela está instalada e se a versão é 1.0.3.
3. Abra `chrome://version` e copie o valor de **Caminho do perfil**. Feche o Chrome para fazer a cópia.
4. No Explorador de Arquivos, entre na pasta de perfil, depois em `Extensions\mhnplloljgchpfpcpbhmcokmnefodjnh\1.0.3_0` (o sufixo da pasta de versão pode variar). A pasta correta contém `manifest.json` diretamente dentro dela.
5. Copie **o conteúdo** dessa pasta de versão, sem a pasta `1.0.3_0` em volta, para uma destas pastas:
   - teste: `%APPDATA%\IdleBoard Isgroi DEV\extensions\hunt`
   - aplicativo estável: `%APPDATA%\IdleBoard Isgroi\extensions\hunt`
6. Confira se existe, por exemplo, `%APPDATA%\IdleBoard Isgroi DEV\extensions\hunt\manifest.json`. Feche e abra o IdleBoard. Em **Configurações**, mantenha `/hunt` ativada. A extensão será carregada separadamente em cada conta; suas configurações ficam nos dados locais de cada sessão.

Uma instalação no DEV não instala automaticamente no aplicativo estável: as duas pastas são independentes. Se a extensão estiver ausente ou não carregar, o jogo continua disponível e o painel mostra um aviso. Para atualizar/remover a extensão, feche o IdleBoard e altere somente sua cópia pessoal nessas pastas fora do projeto. A extensão original pode ter diferenças de comportamento em relação a versões anteriormente adaptadas; erros da extensão devem ser tratados com o autor dela.

Depois de instalada uma vez nessas pastas do Windows, a cópia local continua disponível ao trocar o executável por uma versão nova no mesmo computador. Um pen drive ou ZIP usado em **outro computador** não leva a pasta de dados junto: instale a sua cópia local novamente nesse computador. Nenhuma cópia da extensão entra no GitHub ou no ZIP público.

## Rotom Sniper (opcional)

A [Rotom Sniper 1.5.0 na Chrome Web Store](https://chromewebstore.google.com/detail/rotom-sniper-assistente-p/olccbpdjdkbfgondiiaicmlifhbcggmk) é opcional e não está neste repositório. Instale-a no Chrome e copie **somente os arquivos da extensão** de `Extensions\olccbpdjdkbfgondiiaicmlifhbcggmk\1.5.0_0` (o sufixo pode variar) para `%APPDATA%\IdleBoard Isgroi\extensions\rotom` no aplicativo principal e/ou `%APPDATA%\IdleBoard Isgroi DEV\extensions\rotom` no DEV. `manifest.json` deve ficar diretamente em `rotom`. Não copie cookies, perfil do Chrome ou dados de login.

Abra o aplicativo e clique em **Sniper** no painel da conta desejada. A Rotom só é carregada nessa conta nesse momento; o jogo recarrega uma vez e o Cockpit abre com o auto-snipe pausado. Abrir o Cockpit não faz compra; porém a extensão oferece automações de mercado que podem executar ações no jogo se você as ativar. Confira as regras e os valores antes de habilitá-las. O IdleBoard não valida preços nem controla as compras feitas pela extensão.

## Nova versão

Atualize o campo `version` em `package.json` e `app/package.json`, atualize também `package-lock.json` com `npm.cmd install --package-lock-only`, faça o commit e execute `npm.cmd run release`. O comando se recusa a criar uma release a partir de arquivos ainda não commitados. Publique somente a tag da versão nova; tags históricas de cópias privadas não devem ser enviadas.

---

## English

IdleBoard Isgroi is a local Windows app for arranging up to four separate PokeIdle sessions. The public source and Windows package do **not** bundle the third-party `/hunt for PokeIdle` extension.

**Version 1.1.0:** each game panel has a **Sniper** button that opens Rotom Sniper 1.5.0's Cockpit for that account. Opening the Cockpit was tested in the main app; automatic purchase rules and market results have not been validated by IdleBoard.

### First-time setup

1. Install Node.js 24 or newer (npm is included).
2. Open `IdleBoard-Isgroi.code-workspace` in VS Code.
3. Open **Terminal > New Terminal**.
4. Run `npm.cmd ci` in PowerShell.

### Development workflow

- `npm.cmd run dev` opens **IdleBoard Isgroi DEV** with the same hidden-panel throttling as the main app, a yellow indicator, and separate data.
- `npm.cmd run dev:baseline` opens the same DEV with the previous behavior for comparison. Close one DEV window before opening the other.
- `npm.cmd test` runs the automated tests.
- `npm.cmd run build` checks the JavaScript and creates `dist/IdleBoard-Isgroi/IdleBoard-Isgroi.exe`.
- `npm.cmd run release` requires a clean Git working tree, runs the tests and build, creates a ZIP under `releases/v<version>/`, and creates the version tag if needed. It will not overwrite an existing ZIP.

### GitHub publishing

The public history was reconstructed from verified copies of versions 1.0.0, 1.0.1, 1.0.3, 1.0.5, and 1.0.6. Versions 1.0.2 and 1.0.4 are not tagged because no verified copies were available. See [HISTORICO-PUBLICO.md](HISTORICO-PUBLICO.md). The old private history contained the third-party extension; do not import or push it.

For a future change, review the files in VS Code before committing:

```powershell
git status
git add app tests scripts package.json package-lock.json README.md LEIA-ME.txt ATUALIZAR.txt
git diff --cached --name-only
git commit -m "describe the change"
```

After the commit, create the ZIP and push the branch and its new tag:

```powershell
npm.cmd run release
git push origin main
git push origin v1.1.0 # replace with the next version tag
```

The ZIP is not uploaded to GitHub automatically. Inspect it before attaching it to a GitHub Release. Do not publish the original historical ZIPs: some contain third-party extensions.

### Private data

DEV stores preferences, cookies, and sessions under `%APPDATA%\IdleBoard Isgroi DEV`; the stable app uses its own Electron data folder. Neither is inside this repository. `dist/`, `releases/`, sessions, cookies, `.env` files, keys, and certificates are ignored by Git.

### Optional third-party `/hunt` extension

I use [**/hunt for PokeIdle**, by Liang, on the Chrome Web Store](https://chromewebstore.google.com/detail/hunt-for-pokeidle/mhnplloljgchpfpcpbhmcokmnefodjnh). It is **not included** in this repository or the IdleBoard package. Install it only if you want to and have the right to use it; IdleBoard and the game work without it. The app expects version 1.0.3. Never upload the extension, its `.crx`, or your personal copy to GitHub.

To use your own copy with IdleBoard on Windows:

1. In the **PokeIdle in-game chat**, type `/guia` and open the extension link shown by the game in Chrome. This command only helps you find the link; it **does not install or activate the extension inside IdleBoard**. If no link appears, use the [direct Chrome Web Store page](https://chromewebstore.google.com/detail/hunt-for-pokeidle/mhnplloljgchpfpcpbhmcokmnefodjnh). Check the address before installing.
2. Install the extension in Chrome under its author's terms. At `chrome://extensions`, confirm that it is installed and is version 1.0.3.
3. Open `chrome://version`, copy the **Profile Path**, and close Chrome before copying the files.
4. In File Explorer, open that profile folder and then `Extensions\mhnplloljgchpfpcpbhmcokmnefodjnh\1.0.3_0` (the version folder's suffix may differ). `manifest.json` must be directly inside it.
5. Copy the **contents** of that version folder—not the enclosing `1.0.3_0` folder—to one or both of these locations:
   - DEV: `%APPDATA%\IdleBoard Isgroi DEV\extensions\hunt`
   - stable app: `%APPDATA%\IdleBoard Isgroi\extensions\hunt`
6. Confirm that, for example, `%APPDATA%\IdleBoard Isgroi DEV\extensions\hunt\manifest.json` exists. Restart IdleBoard and leave `/hunt` enabled under **Settings**. Each account loads the extension separately and keeps its own local settings.

DEV and stable use separate folders. If the extension is missing or fails to load, the game still works and IdleBoard shows a notice. To update or remove it, close IdleBoard and change only your personal copy outside this project. The original extension may behave differently from older adapted versions; report extension issues to its author.

Once installed in these Windows data folders, the local copy remains available when you replace the executable on the same computer. A USB drive or ZIP opened on **another computer** does not carry those data folders: install your own local copy again there. The extension is never placed in GitHub or the public ZIP.

### Optional Rotom Sniper

[Rotom Sniper 1.5.0 on the Chrome Web Store](https://chromewebstore.google.com/detail/rotom-sniper-assistente-p/olccbpdjdkbfgondiiaicmlifhbcggmk) is optional and not in this repository. Install it in Chrome, then copy **only its extension files** from `Extensions\olccbpdjdkbfgondiiaicmlifhbcggmk\1.5.0_0` (the suffix may differ) to `%APPDATA%\IdleBoard Isgroi\extensions\rotom` for the main app and/or `%APPDATA%\IdleBoard Isgroi DEV\extensions\rotom` for DEV. Keep `manifest.json` directly inside `rotom`. Do not copy Chrome cookies, profile data, or logins.

Open the app and click **Sniper** in the desired account's panel. Rotom is loaded only for that account on demand; the game reloads once and the Cockpit opens with auto-snipe paused. Opening it does not buy anything, but enabling the extension's automation may perform market actions. Review its rules and amounts before enabling it. IdleBoard does not verify prices or control purchases made by the extension.

### New versions

Update `version` in `package.json` and `app/package.json`, update `package-lock.json` with `npm.cmd install --package-lock-only`, commit the changes, then run `npm.cmd run release`. The release command refuses uncommitted changes. Push only the new tag; do not push tags from the old private history.
