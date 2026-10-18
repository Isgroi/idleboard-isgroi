'use strict';

const { app, BrowserWindow, WebContentsView, ipcMain, protocol, session, dialog, shell, Menu, powerSaveBlocker, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const model = require('./model.cjs');
const { createFarmTracker } = require('./farm-metrics.cjs');
const { HUNT_VERSION, createHuntLoader } = require('./hunt-extension.cjs');

const IS_DEV_MODE = process.env.IDLEBOARD_MODE === 'development';
const APP_NAME = IS_DEV_MODE ? 'IdleBoard Isgroi DEV' : 'IdleBoard Isgroi';

app.setName(APP_NAME);
app.setAppUserModelId(IS_DEV_MODE ? 'br.isgroi.idleboard.dev' : 'br.isgroi.idleboard');
if (IS_DEV_MODE) app.setPath('userData', path.join(app.getPath('appData'), 'IdleBoard Isgroi DEV'));
protocol.registerSchemesAsPrivileged([{ scheme: 'idleboard', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const LOCAL_URL = 'idleboard://app/index.html';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const views = new Map();
const runtime = Object.create(null);
const farms = new Map();
const navigationRequests = new WeakMap();
const appliedViewGeometry = new WeakMap();
const toolsState = { market: null, lives: null };
let window = null;
let configPath;
let state = model.initialState();
let overlayVisible = false;
let lastBounds = {};
let blocker = null;
let saveTimer = null;
let quitting = false;
let huntLoader;
let requestedViewFocus = null;
let stateUpdateTimer = null;

function persist() {
  if (!configPath) return;
  const temporary = configPath + '.tmp';
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, configPath);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { persist(); } catch { notifyStorageFailure(); } }, 150);
}

function notifyStorageFailure() {
  if (!quitting && window && !window.isDestroyed()) dialog.showErrorBox('Não foi possível salvar', 'As preferências não foram gravadas no disco. Confira se há espaço disponível e se o aplicativo tem acesso à sua pasta de usuário.');
}

function publicState() {
  return { ...state, version: app.getVersion(), runtime, tools: toolsState, system: { platform: process.platform, electron: process.versions.electron, huntEnabledAtStartup: huntLoader?.enabled ?? state.huntEnabled, devMode: IS_DEV_MODE } };
}

function emit() {
  if (stateUpdateTimer !== null) { clearTimeout(stateUpdateTimer); stateUpdateTimer = null; }
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('board:state-update', publicState());
}

function scheduleStateUpdate() {
  if (stateUpdateTimer !== null || quitting) return;
  stateUpdateTimer = setTimeout(() => { stateUpdateTimer = null; emit(); }, 120);
}

function stopProfileQueries(id, reason) {
  if (toolsState.market?.profileId === id && toolsState.market.scanning) {
    toolsState.market.scanning = false;
    toolsState.market.error = reason;
  }
  if (toolsState.lives?.profileId === id && toolsState.lives.loading) {
    toolsState.lives.loading = false;
    toolsState.lives.error = reason;
  }
}

function safeUI(event) {
  return !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === LOCAL_URL;
}

function getProfile(id) {
  const p = state.profiles.find(item => item.id === id);
  if (!p) throw new Error('Essa conta não está cadastrada no painel.');
  return p;
}

function getView(id) {
  getProfile(id);
  const v = views.get(id);
  if (!v || v.webContents.isDestroyed()) throw new Error('Abra o painel dessa conta primeiro.');
  return v;
}

function messageForReason(reason) {
  return ({
    collecting: 'Coletando leituras. A taxa por hora aparece após 60 segundos.',
    measured: '',
    awaiting_game: 'Aguardando os dados visíveis do jogo.',
    logged_out: 'A medição foi encerrada ao sair da conta.',
    account_changed: 'A medição foi encerrada porque a conta mudou.',
    hunt_changed: 'A medição foi encerrada porque a hunt mudou. Inicie outra para comparar.',
    pokemon_changed: 'A medição foi encerrada porque o Pokémon ativo mudou.',
    observation_gap: 'A medição foi encerrada porque houve uma interrupção nas leituras.',
    invalid_snapshot: 'A medição foi encerrada porque o jogo não forneceu uma leitura completa.',
    xp_discontinuity: 'A medição foi encerrada porque não foi possível acompanhar a mudança de nível com precisão.',
    pokemon_xp_discontinuity: 'A medição foi encerrada porque o XP do Pokémon mudou de forma que não pôde ser medida.',
    session_elsewhere: 'Esta conta foi aberta em outro lugar. A medição foi encerrada.',
    account_alert: 'O jogo exibiu um aviso de conta. A medição foi encerrada.',
    offline: 'A medição foi encerrada por falta de conexão.',
    reconnecting: 'O jogo está reconectando. A medição foi encerrada.',
    panel_closed: 'A medição foi encerrada ao fechar o painel.',
    reload: 'A medição foi encerrada ao recarregar o jogo.',
  })[reason] || 'Medição encerrada. Inicie outra quando o jogo estiver pronto.';
}

function farmSnapshot(entry, metric, running = entry.running, notice = null) {
  return {
    running, startedAt: metric.startedAt, elapsedMs: metric.elapsedMs,
    trainerXp: metric.trainerXpGain, pokemonXp: metric.pokemonXpGain,
    trainerXpPerHour: metric.trainerXpPerHour, pokemonXpPerHour: metric.pokemonXpPerHour,
    goldDelta: metric.goldDelta, valid: metric.valid, ready: metric.ready,
    notice: notice ?? messageForReason(metric.reason),
  };
}

function finishFarm(id, reason = '', metricOverride = null) {
  const entry = farms.get(id);
  if (!entry || !entry.running) return null;
  const metric = metricOverride || entry.tracker.current();
  entry.running = false;
  const notice = reason ? messageForReason(reason) : metric.ready ? 'Medição salva. Compare o XP por hora com outras hunts.' : 'Medição encerrada antes de 60 segundos; não foi adicionada à comparação.';
  if (metric.ready && metric.valid) {
    const trial = model.cleanTrial({
      id: randomUUID(), profileName: getProfile(id).name,
      hunt: entry.hunt, pokemonName: entry.pokemonName,
      elapsedMs: metric.elapsedMs, trainerXp: metric.trainerXpGain, pokemonXp: metric.pokemonXpGain,
      goldDelta: metric.goldDelta, endedAt: Date.now(), notice: reason ? notice : '',
    });
    if (trial) state.trials = [trial, ...state.trials].slice(0, 200);
    scheduleSave();
  }
  if (runtime[id]) runtime[id].farm = farmSnapshot(entry, metric, false, notice);
  return notice;
}

function consumeStats(id, stats) {
  const r = runtime[id];
  if (!r) return;
  r.stats = stats;
  if (!stats.loggedIn || ['offline', 'reconnecting', 'session_elsewhere', 'account_alert'].includes(stats.status)) {
    stopProfileQueries(id, 'A consulta foi interrompida. Entre no jogo e consulte novamente.');
  }
  const entry = farms.get(id);
  if (entry?.running) {
    const previous = entry.tracker.current();
    const next = entry.tracker.update(stats);
    if (!next.valid || (previous.startedAt && next.startedAt !== previous.startedAt)) finishFarm(id, next.reason, previous);
    else r.farm = farmSnapshot(entry, next);
  }
  scheduleStateUpdate();
}

function updatePowerBlocker() {
  const needed = state.keepAwake && views.size > 0;
  if (needed && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!needed && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
}

function applyBounds() {
  if (!window || window.isDestroyed()) return;
  const size = window.getContentSize();
  let focusTarget = null;
  for (const [id, view] of views) {
    const bounds = model.cleanBounds(lastBounds[id], size);
    const visible = !overlayVisible && !!bounds && (state.layout !== 'single' || state.focusedId === id);
    const applied = appliedViewGeometry.get(view) || {};
    if (bounds && (!applied.bounds || ['x', 'y', 'width', 'height'].some(key => bounds[key] !== applied.bounds[key]))) {
      view.setBounds(bounds);
      applied.bounds = bounds;
    }
    if (applied.visible !== visible) { view.setVisible(visible); applied.visible = visible; }
    appliedViewGeometry.set(view, applied);
    if (visible && requestedViewFocus === id && !view.webContents.isDestroyed()) focusTarget = view;
  }
  // In single-account mode, the renderer first needs to report the new slot.
  // Do not focus an invisible view or steal focus from an open shell dialog.
  if (focusTarget) {
    requestedViewFocus = null;
    focusTarget.webContents.focus();
  }
}

function applyLayoutZoom() {
  for (const profile of state.profiles) {
    if (!state.openIds.includes(profile.id)) continue;
    const target = model.layoutZoom(state, profile.id);
    if (profile.zoom === target) continue;
    profile.zoom = target;
    const view = views.get(profile.id);
    if (view && !view.webContents.isDestroyed()) view.webContents.setZoomFactor(target);
  }
}

function selectAccount(id, layout = state.layout) {
  const zoomChanged = state.layout !== layout || (layout === 'single' && state.focusedId !== id);
  state.focusedId = id;
  state.layout = layout;
  if (zoomChanged) applyLayoutZoom();
  requestedViewFocus = id;
}

function enterFocus(id = state.focusedId || state.openIds[0]) {
  getView(id);
  selectAccount(id, state.focusLayout);
}

function handleKeys(contents) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if ((input.control || input.meta) && input.shift && !input.alt && String(input.key).toLowerCase() === 'b') {
      event.preventDefault();
      if (!input.isAutoRepeat) {
        state.toolbarHidden = !state.toolbarHidden;
        scheduleSave();
        emit();
      }
      return;
    }
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
    if ((input.control || input.meta) && /^[1-4]$/.test(input.key)) {
      const id = state.openIds[Number(input.key) - 1];
      if (!id) return;
      event.preventDefault();
      enterFocus(id);
      applyBounds();
      scheduleSave();
      emit();
    }
  });
}

function secureSession(ses) {
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', event => event.preventDefault());
}

function markBlocked(id) {
  const r = runtime[id];
  if (r) { r.notice = 'Esse link sai do jogo. Abra-o no seu navegador habitual.'; emit(); }
}

function navigateGame(id, { reload = false } = {}) {
  const view = getView(id);
  const contents = view.webContents;
  const request = (navigationRequests.get(view) || 0) + 1;
  navigationRequests.set(view, request);
  // Register document_start / MAIN scripts before the game creates its socket.
  // Keep a cancelled/closed view from navigating when registration resolves.
  return huntLoader.load(contents.session).then(result => {
    if (views.get(id) !== view || contents.isDestroyed() || navigationRequests.get(view) !== request) return;
    runtime[id].hunt = result;
    emit();
    if (reload && contents.getURL()) contents.reload();
    else return contents.loadURL(model.GAME_URL).catch(() => {});
  });
}

function createGameView(id) {
  if (views.has(id)) return views.get(id);
  const profile = getProfile(id);
  const ses = session.fromPartition(model.partitionFor(id));
  if (!ses.__isgroiSecured) { secureSession(ses); ses.__isgroiSecured = true; }
  const view = new WebContentsView({ webPreferences: {
    session: ses, preload: path.join(__dirname, 'game-preload.cjs'),
    nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
    contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
    allowRunningInsecureContent: false, backgroundThrottling: false,
    navigateOnDragDrop: false, spellcheck: false,
  } });
  views.set(id, view);
  runtime[id] = { status: 'loading', errorMessage: null, stats: null, farm: null, notice: '', hunt: { status: huntLoader.enabled ? 'loading' : 'disabled', version: HUNT_VERSION } };
  view.setBackgroundColor('#0c1423');
  if (typeof view.setBorderRadius === 'function') view.setBorderRadius(8);
  view.setVisible(false);
  appliedViewGeometry.set(view, { visible: false });
  window.contentView.addChildView(view);
  const contents = view.webContents;
  contents.setAudioMuted(profile.muted);
  contents.setZoomFactor(profile.zoom);
  handleKeys(contents);
  contents.on('focus', () => {
    // Clicking a game in the grid updates its account tab. In focus layout,
    // only explicit selection changes the large panel, avoiding mid-click jumps.
    if (overlayVisible || state.layout !== 'grid' || views.get(id) !== view || contents.isDestroyed() || !state.openIds.includes(id) || state.focusedId === id) return;
    if (requestedViewFocus && requestedViewFocus !== id) return;
    state.focusedId = id;
    scheduleSave();
    emit();
  });
  contents.on('will-navigate', (event, url) => {
    if (!model.allowedNavigation(url)) { event.preventDefault(); markBlocked(id); }
  });
  contents.on('will-redirect', (event, url, _inPlace, isMainFrame) => {
    if (isMainFrame && !model.allowedNavigation(url)) { event.preventDefault(); markBlocked(id); }
  });
  contents.setWindowOpenHandler(({ url }) => {
    // Official OAuth links use the same account partition and never the shell.
    if (model.allowedNavigation(url)) contents.loadURL(url).catch(() => {});
    else markBlocked(id);
    return { action: 'deny' };
  });
  contents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (!isMainFrame || inPlace || !runtime[id]) return;
    finishFarm(id, 'reload');
    stopProfileQueries(id, 'A consulta foi encerrada ao carregar outra página. Aguarde o jogo e consulte novamente.');
    runtime[id].status = 'loading';
    runtime[id].errorMessage = null;
    runtime[id].stats = null;
    runtime[id].notice = '';
    emit();
  });
  contents.on('did-finish-load', () => {
    if (!runtime[id]) return;
    runtime[id].status = 'ready';
    runtime[id].errorMessage = null;
    contents.setZoomFactor(getProfile(id).zoom);
    emit();
  });
  contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (!mainFrame || code === -3 || !runtime[id]) return;
    finishFarm(id, 'offline');
    stopProfileQueries(id, 'A consulta foi encerrada por falha ao carregar o jogo.');
    runtime[id].status = 'error';
    runtime[id].errorMessage = `O jogo não carregou (código ${Number(code)}). Verifique a internet e clique em Recarregar.`;
    emit();
  });
  contents.on('render-process-gone', () => {
    if (!runtime[id]) return;
    finishFarm(id, 'offline');
    stopProfileQueries(id, 'A consulta foi encerrada porque o processo do jogo foi interrompido.');
    runtime[id].status = 'error';
    runtime[id].errorMessage = 'O processo do jogo foi interrompido. Clique em Recarregar para abrir novamente.';
    emit();
  });
  navigateGame(id);
  applyBounds();
  updatePowerBlocker();
  return view;
}

function closePanel(id, reason = 'panel_closed') {
  if (requestedViewFocus === id) requestedViewFocus = null;
  finishFarm(id, reason);
  const view = views.get(id);
  if (view) {
    window?.contentView.removeChildView(view);
    views.delete(id);
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
  }
  farms.delete(id);
  delete runtime[id];
  delete lastBounds[id];
  stopProfileQueries(id, 'A consulta foi encerrada porque o painel foi fechado.');
  state.openIds = state.openIds.filter(item => item !== id);
  if (state.focusedId === id) selectAccount(state.openIds[0] || null);
  updatePowerBlocker();
}

async function performAction(action, payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  let message = '';
  switch (action) {
    case 'profile:add': {
      if (state.profiles.length >= model.MAX_PROFILES) throw new Error('O painel aceita até quatro contas. Esse também é o limite pessoal informado pelo PokeIdle.');
      const name = model.text(p.name, 32);
      if (!name) throw new Error('Informe um nome para identificar essa conta.');
      const profile = { id: randomUUID(), name, color: model.color(p.color), zoom: 0.6, muted: true, createdAt: Date.now() };
      state.profiles.push(profile);
      state.openIds.push(profile.id);
      selectAccount(profile.id);
      createGameView(profile.id);
      break;
    }
    case 'profile:update': {
      const profile = getProfile(p.id);
      const name = model.text(p.name, 32);
      if (!name) throw new Error('O nome da conta não pode ficar vazio.');
      profile.name = name;
      profile.color = model.color(p.color || profile.color);
      break;
    }
    case 'profile:delete': {
      const profile = getProfile(p.id);
      const answer = await dialog.showMessageBox(window, { type: 'question', title: 'Remover conta do painel', message: `Remover “${profile.name}” deste computador?`, detail: 'O painel será fechado e sua sessão local será apagada. Sua conta e seu progresso no PokeIdle não serão excluídos.', buttons: ['Cancelar', 'Remover sessão local'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer.response !== 1) return { ok: true, state: publicState() };
      closePanel(profile.id);
      const ses = session.fromPartition(model.partitionFor(profile.id));
      await ses.clearStorageData();
      await ses.clearCache();
      state.profiles = state.profiles.filter(item => item.id !== profile.id);
      break;
    }
    case 'panel:open': {
      const profile = getProfile(p.id);
      if (!state.openIds.includes(p.id)) {
        state.openIds.push(p.id);
        profile.zoom = 0.6;
      }
      selectAccount(p.id);
      createGameView(p.id);
      break;
    }
    case 'panel:close': getProfile(p.id); closePanel(p.id); break;
    case 'panel:reload': finishFarm(p.id, 'reload'); navigateGame(p.id, { reload: true }); break;
    case 'panel:home': finishFarm(p.id, 'reload'); navigateGame(p.id); break;
    case 'panel:focus': getView(p.id); selectAccount(p.id); break;
    case 'focus:enter': enterFocus(p.id); break;
    case 'panel:zoom': {
      const profile = getProfile(p.id);
      profile.zoom = model.zoom(p.zoom);
      if (views.has(p.id)) getView(p.id).webContents.setZoomFactor(profile.zoom);
      break;
    }
    case 'panel:mute': {
      const profile = getProfile(p.id);
      profile.muted = p.muted === true;
      if (views.has(p.id)) getView(p.id).webContents.setAudioMuted(profile.muted);
      break;
    }
    case 'layout:set': {
      if (!model.LAYOUTS.includes(p.layout)) throw new Error('Layout inválido.');
      if (p.layout !== 'grid' && state.openIds.length === 0) throw new Error('Abra uma conta antes de entrar no foco.');
      if (p.layout !== 'grid') {
        state.focusLayout = p.layout;
        enterFocus();
      } else selectAccount(state.focusedId, 'grid');
      break;
    }
    case 'toolbar:toggle': state.toolbarHidden = !state.toolbarHidden; break;
    case 'settings:update': {
      if (p.theme !== undefined) { if (!model.THEMES.includes(p.theme)) throw new Error('Tema inválido.'); state.theme = p.theme; }
      if (typeof p.keepAwake === 'boolean') state.keepAwake = p.keepAwake;
      if (typeof p.sidebarCollapsed === 'boolean') state.sidebarCollapsed = p.sidebarCollapsed;
      if (typeof p.toolbarHidden === 'boolean') state.toolbarHidden = p.toolbarHidden;
      if (typeof p.huntEnabled === 'boolean') {
        state.huntEnabled = p.huntEnabled;
        if (state.huntEnabled !== huntLoader.enabled) message = 'Reabra o aplicativo para aplicar a mudança da Hunt nas quatro sessões.';
      }
      updatePowerBlocker();
      break;
    }
    case 'window:fullscreen': window.setFullScreen(!window.isFullScreen()); break;
    case 'game:eco-all': {
      const eligible = state.openIds.filter(id => {
        const r = runtime[id], view = views.get(id);
        return view && !view.webContents.isDestroyed() && model.isGameURL(view.webContents.getURL())
          && r?.status === 'ready' && r.stats?.loggedIn
          && ['game_visible', 'fainted'].includes(r.stats.status) && Date.now() - r.stats.at < 40_000;
      });
      if (!eligible.length) throw new Error('Entre no jogo e aguarde a conexão de pelo menos uma conta para ativar o Eco.');
      const pending = eligible.filter(id => runtime[id].stats.economy !== true);
      if (!pending.length) { message = 'O Eco já está ativo nas contas conectadas.'; break; }
      let requested = 0, busy = 0;
      for (const id of pending) {
        if ((toolsState.market?.profileId === id && toolsState.market.scanning)
          || (toolsState.lives?.profileId === id && toolsState.lives.loading)) {
          runtime[id].notice = 'Aguarde a consulta desta conta terminar e tente ativar o Eco novamente.';
          runtime[id].ecoNotice = runtime[id].notice;
          busy += 1;
          continue;
        }
        runtime[id].notice = '';
        runtime[id].ecoNotice = '';
        views.get(id).webContents.send('game:tool', { tool: 'economy-on' });
        requested += 1;
      }
      message = requested
        ? `Ativando Eco em ${requested} conta(s). Acompanhe a confirmação nas Configurações.`
        : 'As contas restantes estão em consulta. Aguarde a conclusão e tente novamente.';
      if (requested && busy) message += ` ${busy} conta(s) em consulta foram mantidas como estão.`;
      break;
    }
    case 'game:tool': {
      const view = getView(p.id);
      const allowedTools = ['items', 'sales', 'team', 'economy', 'lives', 'scan-stones', 'cancel-scan', 'view-stone'];
      if (!allowedTools.includes(p.tool)) throw new Error('Ferramenta desconhecida.');
      if (p.tool !== 'cancel-scan' && !runtime[p.id]?.stats?.loggedIn) throw new Error('Entre no PokeIdle nessa conta antes de usar esta ferramenta.');
      if (p.tool === 'scan-stones') {
        const previous = toolsState.market?.profileId;
        if (previous && previous !== p.id && views.has(previous)) views.get(previous).webContents.send('game:tool', { tool: 'cancel-scan' });
        toolsState.market = { profileId: p.id, available: false, scanning: true, scanned: 0, total: 0, catalog: [], at: Date.now(), error: '' };
      }
      if (p.tool === 'lives') toolsState.lives = { profileId: p.id, available: false, links: [], at: Date.now(), error: '', loading: true };
      if (p.tool === 'view-stone' && (toolsState.market?.profileId !== p.id || !toolsState.market.catalog.some(item => item.itemId === p.itemId))) throw new Error('Atualize a lista e escolha uma pedra encontrada nessa conta.');
      view.webContents.send('game:tool', { tool: p.tool, ...(p.tool === 'view-stone' ? { itemId: p.itemId } : {}) });
      break;
    }
    case 'live:open': {
      const url = model.liveURL(p.url);
      if (!url || !toolsState.lives?.links.some(link => link.url === url)) throw new Error('Escolha um canal da lista de lives carregada pelo jogo.');
      await shell.openExternal(url);
      message = 'Live aberta no seu navegador padrão.';
      break;
    }
    case 'data:open-folder': await shell.openPath(app.getPath('userData')); break;
    case 'data:export': {
      const answer = await dialog.showSaveDialog(window, { title: 'Exportar preferências e medições', defaultPath: 'IdleBoard-Isgroi-preferencias.json', filters: [{ name: 'Backup JSON', extensions: ['json'] }] });
      if (!answer.canceled && answer.filePath) fs.writeFileSync(answer.filePath, JSON.stringify(model.exportPreferences(state), null, 2), { encoding: 'utf8', mode: 0o600 });
      message = answer.canceled ? '' : 'Preferências e medições exportadas. Logins e sessões não foram incluídos.';
      break;
    }
    case 'data:import': {
      const answer = await dialog.showOpenDialog(window, { title: 'Importar preferências e medições', filters: [{ name: 'Backup JSON', extensions: ['json'] }], properties: ['openFile'] });
      if (answer.canceled || !answer.filePaths[0]) break;
      if (fs.statSync(answer.filePaths[0]).size > 2 * 1024 * 1024) throw new Error('O backup é grande demais. O limite é 2 MB.');
      let raw;
      try { raw = JSON.parse(fs.readFileSync(answer.filePaths[0], 'utf8')); } catch { throw new Error('Não foi possível ler esse arquivo JSON.'); }
      const previousLayout = state.layout;
      model.importPreferences(state, raw);
      if (state.layout !== previousLayout) applyLayoutZoom();
      message = 'Preferências e medições importadas. Suas sessões atuais foram preservadas.';
      break;
    }
    case 'farm:start': {
      getView(p.id);
      const stats = runtime[p.id]?.stats;
      if (!stats?.loggedIn || !['game_visible', 'fainted'].includes(stats.status) || Date.now() - stats.at > 40000) throw new Error('Entre no jogo e aguarde uma leitura de XP antes de iniciar a medição.');
      if (farms.get(p.id)?.running) throw new Error('Já existe uma medição em andamento para esta conta.');
      const tracker = createFarmTracker();
      const metric = tracker.update({ ...stats, at: Date.now() });
      if (!metric.valid) throw new Error('O XP do treinador ainda não está disponível na tela do jogo.');
      const entry = { tracker, running: true, hunt: stats.hunt, pokemonName: stats.pokemon?.name || 'Pokémon' };
      farms.set(p.id, entry);
      runtime[p.id].farm = farmSnapshot(entry, metric);
      message = 'Medição iniciada. Mantenha a mesma hunt e o mesmo Pokémon por pelo menos 60 segundos.';
      break;
    }
    case 'farm:stop': getProfile(p.id); message = finishFarm(p.id) || 'Não há uma medição em andamento.'; break;
    case 'trial:delete': state.trials = state.trials.filter(trial => trial.id !== p.id); break;
    default: throw new Error('Ação não reconhecida.');
  }
  applyBounds();
  scheduleSave();
  emit();
  return { ok: true, message, state: publicState() };
}

function setupIPC() {
  ipcMain.handle('board:state', event => safeUI(event) ? publicState() : null);
  ipcMain.handle('board:action', async (event, action, payload) => {
    if (!safeUI(event)) return { ok: false, error: 'Origem não autorizada.' };
    try { return await performAction(action, payload); }
    catch (error) { return { ok: false, error: error.code ? 'Não foi possível concluir a operação. Verifique o acesso ao disco e tente novamente.' : model.text(error.message, 240) }; }
  });
  ipcMain.on('board:bounds', (event, bounds) => {
    if (!safeUI(event) || !bounds || typeof bounds !== 'object' || Array.isArray(bounds)) return;
    const sanitized = {};
    for (const id of state.openIds) if (Object.hasOwn(bounds, id)) sanitized[id] = bounds[id];
    lastBounds = sanitized;
    applyBounds();
  });
  ipcMain.handle('board:overlay', (event, visible) => {
    if (!safeUI(event)) return false;
    overlayVisible = visible === true;
    applyBounds();
    return true;
  });
  const lastReceived = new Map();
  ipcMain.on('game:stats', (event, raw) => {
    const entry = [...views].find(([, view]) => view.webContents === event.sender);
    if (!entry || event.senderFrame !== event.sender.mainFrame || !model.isGameURL(event.senderFrame.url)) return;
    const now = Date.now();
    if (now - (lastReceived.get(entry[0]) || 0) < 500) return;
    lastReceived.set(entry[0], now);
    const stats = model.sanitizeStats(raw, now);
    if (stats) consumeStats(entry[0], stats);
  });
  const sourceProfile = event => {
    const entry = [...views].find(([, view]) => view.webContents === event.sender);
    return entry && event.senderFrame === event.sender.mainFrame && model.isGameURL(event.senderFrame.url) ? entry[0] : null;
  };
  ipcMain.on('game:market', (event, raw) => {
    const id = sourceProfile(event);
    if (!id || toolsState.market?.profileId !== id) return;
    const snapshot = model.sanitizeMarket(raw, id);
    if (snapshot) { toolsState.market = snapshot; emit(); }
  });
  ipcMain.on('game:lives', (event, raw) => {
    const id = sourceProfile(event);
    if (!id || toolsState.lives?.profileId !== id) return;
    const snapshot = model.sanitizeLives(raw, id);
    if (snapshot) { toolsState.lives = snapshot; emit(); }
  });
  ipcMain.on('game:tool-result', (event, raw) => {
    const id = sourceProfile(event);
    if (!id || !runtime[id] || !raw || typeof raw !== 'object') return;
    if (raw.ok === false) {
      const error = model.text(raw.error, 240) || 'A ferramenta não está disponível nesta tela do jogo.';
      runtime[id].notice = error;
      if (raw.tool === 'economy-on') runtime[id].ecoNotice = error;
      if (raw.tool === 'scan-stones' && toolsState.market?.profileId === id) { toolsState.market.scanning = false; toolsState.market.error = error; }
      if (raw.tool === 'lives' && toolsState.lives?.profileId === id) { toolsState.lives.loading = false; toolsState.lives.error = error; }
    } else {
      runtime[id].notice = '';
      if (raw.tool === 'economy-on') runtime[id].ecoNotice = '';
      // A forced DOM sample can arrive inside the stats rate limit. The explicit
      // tool acknowledgement carries the confirmed flag without advancing XP/time.
      if (raw.ok === true && ['economy', 'economy-on'].includes(raw.tool)
        && typeof raw.economy === 'boolean' && runtime[id].stats?.loggedIn) {
        runtime[id].stats = { ...runtime[id].stats, economy: raw.economy };
      }
    }
    emit();
  });
}

function setupLocalProtocol() {
  protocol.handle('idleboard', async request => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (url.hostname !== 'app' || !/^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pathname)) return new Response('Not found', { status: 404 });
    const ext = path.extname(pathname);
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[ext];
    if (!mime) return new Response('Not found', { status: 404 });
    try {
      const bytes = await fs.promises.readFile(path.join(__dirname, 'ui', pathname.slice(1)));
      return new Response(bytes, { headers: { 'Content-Type': mime, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}

function createWindow() {
  const desktop = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({ width: Math.min(1480, desktop.width), height: Math.min(920, desktop.height), minWidth: 1060, minHeight: 700, show: false, backgroundColor: '#0c1423', title: IS_DEV_MODE ? `IdleBoard Isgroi DEV — v${app.getVersion()}-dev` : `IdleBoard Isgroi — v${app.getVersion()}`, autoHideMenuBar: true, icon: path.join(__dirname, 'ui', 'icon.png'), webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true,
    nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true,
    webviewTag: false, navigateOnDragDrop: false, spellcheck: false,
  } });
  secureSession(window.webContents.session);
  window.once('ready-to-show', () => { window.maximize(); window.show(); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  handleKeys(window.webContents);
  window.on('resize', applyBounds);
  window.on('close', () => {
    if (stateUpdateTimer !== null) { clearTimeout(stateUpdateTimer); stateUpdateTimer = null; }
    for (const id of state.openIds) finishFarm(id, 'panel_closed');
    try { persist(); } catch { notifyStorageFailure(); }
    for (const view of views.values()) {
      window.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
    }
    views.clear();
    if (blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  });
  window.webContents.once('did-finish-load', () => {
    for (const id of state.openIds) createGameView(id);
    emit();
  });
  window.loadURL(LOCAL_URL);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    configPath = path.join(app.getPath('userData'), 'preferences.json');
    try {
      if (fs.existsSync(configPath) && fs.statSync(configPath).size <= 2 * 1024 * 1024) state = model.restoreState(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    } catch {
      // Preserve corrupt input for recovery; never silently overwrite it.
      try { fs.copyFileSync(configPath, configPath + '.recovery-' + Date.now()); } catch {}
      dialog.showErrorBox('Preferências não puderam ser lidas', 'Uma cópia do arquivo original foi preservada quando possível. O painel abrirá com preferências novas; as contas no jogo não foram alteradas.');
    }
    applyLayoutZoom();
    huntLoader = createHuntLoader({ enabled: state.huntEnabled, directory: path.join(app.getPath('userData'), 'extensions', 'hunt') });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Aplicativo', submenu: [{ role: 'quit', label: 'Sair' }] },
      { label: 'Editar', submenu: [{ role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    ]));
    setupLocalProtocol();
    setupIPC();
    createWindow();
    setInterval(() => {
      let changed = false;
      for (const [id, entry] of farms) {
        if (entry.running && Date.now() - (runtime[id]?.stats?.at || 0) > 45000) {
          finishFarm(id, 'observation_gap');
          changed = true;
        }
      }
      if (changed) emit();
    }, 5000).unref();
  }).catch(() => {
    dialog.showErrorBox('IdleBoard Isgroi', 'Não foi possível iniciar o painel. Extraia a pasta inteira do arquivo ZIP e abra o executável novamente.');
    app.quit();
  });
  app.on('before-quit', () => { quitting = true; clearTimeout(saveTimer); clearTimeout(stateUpdateTimer); stateUpdateTimer = null; });
  app.on('window-all-closed', () => app.quit());
}
