'use strict';

// Exercise real IPC/lifecycle wiring with native Electron objects replaced by
// in-memory doubles. This does not claim to run the Windows binary or a login.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');

test('main wires isolated sessions, trusted IPC, overlays and interrupted queries', async () => {
  const dataFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'idleboard-core-test-'));
  const appRoot = path.resolve(__dirname, '../app');
  const realRequire = createRequire(path.join(appRoot, 'main.cjs'));
  const handlers = new Map(), sessions = new Map(), createdViews = [];
  const timeouts = new Map(), intervals = [];
  let timerId = 0;
  let win;
  class Contents extends EventEmitter {
    constructor(session) { super(); this.session = session; this.mainFrame = { url: '' }; this.sent = []; this.destroyed = false; }
    loadURL(url) {
      if (url.startsWith('https://pokeidle.io/')) assert.equal(this.session.extensionSettled, true, 'game navigation waits for extension registration');
      this.loads = (this.loads || 0) + 1;
      this.mainFrame.url = url;
      this.emit('did-start-navigation', {}, url, false, true);
      queueMicrotask(() => { this.emit('did-finish-load'); if (win?.webContents === this) win.emit('ready-to-show'); });
      return Promise.resolve();
    }
    isDestroyed() { return this.destroyed; }
    getURL() { return this.mainFrame.url; }
    setWindowOpenHandler(fn) { this.openHandler = fn; }
    setAudioMuted(value) { this.muted = value; }
    setZoomFactor(value) { this.zoom = value; }
    send(channel, payload) { this.sent.push({ channel, payload }); }
    close() { this.destroyed = true; }
    focus() { this.focusCount = (this.focusCount || 0) + 1; this.emit('focus'); }
    reload() { return this.loadURL(this.mainFrame.url); }
  }
  function makeSession() {
    const value = new EventEmitter();
    value.setPermissionRequestHandler = fn => { value.requestPermission = fn; };
    value.setPermissionCheckHandler = fn => { value.checkPermission = fn; };
    value.clearStorageData = async () => { value.cleared = true; };
    value.clearCache = async () => {};
    value.extensionLoadCalls = 0;
    value.extensions = {
      loadExtension(directory, options) {
        value.extensionLoadCalls++;
        assert.equal(directory, path.join(appRoot, 'extensions', 'hunt'));
        assert.deepEqual(options, { allowFileAccess: false });
        return new Promise((resolve, reject) => {
          value.finishExtension = success => {
            value.extensionSettled = true;
            if (success) resolve({ id: 'fixture-hunt', version: '1.0.3' });
            else reject(new Error('Fixture registration failure'));
          };
        });
      },
      removeExtension() {},
    };
    return value;
  }
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.children = [];
      this.webContents = new Contents(makeSession());
      this.contentView = { addChildView: v => this.children.push(v), removeChildView: v => { this.children = this.children.filter(x => x !== v); } };
      win = this;
    }
    loadURL(url) { return this.webContents.loadURL(url); }
    isDestroyed() { return false; }
    getContentSize() { return [1280, 800]; }
    maximize() {} show() {} focus() {} restore() {}
    isMinimized() { return false; }
    isFullScreen() { return Boolean(this.fullscreen); }
    setFullScreen(value) { this.fullscreen = value; }
  }
  class NativeView {
    constructor(options) { this.options = options; this.webContents = new Contents(options.webPreferences.session); createdViews.push(this); }
    setBounds(value) { this.bounds = value; this.boundsUpdates = (this.boundsUpdates || 0) + 1; }
    setVisible(value) { this.visible = value; this.visibilityUpdates = (this.visibilityUpdates || 0) + 1; }
    setBackgroundColor() {} setBorderRadius() {}
  }
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, setAppUserModelId() {}, getVersion: () => '1.0.5', getPath: () => dataFolder, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {} });
  const ipcMain = new EventEmitter();
  ipcMain.handle = (channel, callback) => handlers.set(channel, callback);
  const electron = {
    app, BrowserWindow: Window, WebContentsView: NativeView, ipcMain,
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    session: { fromPartition(name) { if (!sessions.has(name)) sessions.set(name, makeSession()); return sessions.get(name); } },
    dialog: { showErrorBox() {}, showMessageBox: async () => ({ response: 1 }) },
    shell: { openExternal: async () => {}, openPath: async () => '' },
    Menu: { buildFromTemplate: x => x, setApplicationMenu() {} },
    powerSaveBlocker: { start: () => 1, stop() {} },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1280, height: 800 } }) },
  };
  try {
    vm.runInNewContext(fs.readFileSync(path.join(appRoot, 'main.cjs'), 'utf8'), {
      require: name => name === 'electron' ? electron : realRequire(name),
      __dirname: appRoot, process, URL, Response, console,
      setTimeout(callback, delay) { const id = ++timerId; timeouts.set(id, { callback, delay }); return id; },
      clearTimeout(id) { timeouts.delete(id); },
      setInterval(callback, delay) { const timer = { callback, delay, unref() {} }; intervals.push(timer); return timer; },
    }, { filename: 'main.cjs' });
    await new Promise(setImmediate);
    const ui = () => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
    const action = (name, payload) => handlers.get('board:action')(ui(), name, payload);
    const current = () => handlers.get('board:state')(ui());
    assert.equal(current().theme, 'blue');
    assert.equal(current().focusLayout, 'single');
    assert.equal((await action('focus:enter')).ok, false);
    assert.equal((await action('layout:set', { layout: 'focus' })).ok, false);
    assert.equal(current().layout, 'grid');
    assert.equal(createdViews.length, 0);
    for (let i = 1; i <= 4; i++) assert.equal((await action('profile:add', { name: 'Conta ' + i })).ok, true);
    assert.equal(sessions.size, 4);
    assert.equal(createdViews.length, 4);
    assert.equal((await action('profile:add', { name: 'Quinta' })).ok, false);
    assert(createdViews.every(v => v.options.webPreferences.sandbox && v.options.webPreferences.contextIsolation && !v.options.webPreferences.nodeIntegration));
    assert.equal(new Set(createdViews.map(v => v.webContents.session)).size, 4);
    assert(createdViews.every(v => !v.webContents.mainFrame.url));
    assert.equal(current().huntEnabled, true);
    assert.equal(current().system.huntEnabledAtStartup, true);
    assert.equal(win.webContents.session.extensionLoadCalls, 0);
    for (const ses of sessions.values()) {
      assert.equal(ses.extensionLoadCalls, 1);
      ses.finishExtension(true);
    }
    await new Promise(setImmediate);
    assert(createdViews.every(v => v.webContents.mainFrame.url === 'https://pokeidle.io/app'));
    assert(Object.values(current().runtime).every(r => r.hunt.status === 'loaded'));
    const assertZooms = expected => {
      assert.deepEqual(createdViews.map(v => v.webContents.zoom), expected, 'native game zoom matches the layout');
      assert.deepEqual(Array.from(current().profiles, p => p.zoom), expected, 'the zoom labels receive the same values');
    };
    assertZooms([0.6, 0.6, 0.6, 0.6]);
    const [first, second] = current().openIds;
    const bounds = Object.fromEntries(current().openIds.map((id, i) => [id, { x: i % 2 * 640, y: Math.floor(i / 2) * 400 + 40, width: 630, height: 350 }]));
    ipcMain.emit('board:bounds', ui(), bounds);
    assert(createdViews.every(v => v.visible));
    const geometryCalls = () => createdViews.map(v => [v.boundsUpdates, v.visibilityUpdates]);
    const initialGeometryCalls = geometryCalls();
    for (let i = 0; i < 20; i++) ipcMain.emit('board:bounds', ui(), bounds);
    assert.deepEqual(geometryCalls(), initialGeometryCalls, 'repeated equal bounds do not call native resize/show again');
    ipcMain.emit('board:bounds', ui(), { ...bounds, [first]: { ...bounds[first], width: 620 } });
    assert.equal(createdViews[0].boundsUpdates, initialGeometryCalls[0][0] + 1, 'a real size change still reaches the native view');
    ipcMain.emit('board:bounds', ui(), bounds);
    createdViews[0].webContents.focus();
    assert.equal(current().focusedId, first, 'clicking a game in the grid selects its account tab');
    const profilesBeforeToggle = JSON.stringify(current().profiles);
    const nativeContentsBeforeToggle = createdViews.map(v => v.webContents);
    await action('toolbar:toggle');
    assert.equal(current().toolbarHidden, true);
    let prevented = false;
    createdViews[0].webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { type: 'keyDown', key: 'B', control: true, shift: true });
    assert.equal(prevented, true);
    assert.equal(current().toolbarHidden, false);
    createdViews[0].webContents.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: 'B', control: true, shift: true, isAutoRepeat: true });
    assert.equal(current().toolbarHidden, false);
    assert.equal(JSON.stringify(current().profiles), profilesBeforeToggle);
    assert.deepEqual(createdViews.map(v => v.webContents), nativeContentsBeforeToggle);
    assert.equal(sessions.size, 4);
    assert(createdViews.every(v => !v.webContents.isDestroyed()));
    const loadsBeforeSettings = createdViews.map(v => v.webContents.loads);
    await action('settings:update', { huntEnabled: false });
    assert.equal(current().huntEnabled, false);
    assert.equal(current().system.huntEnabledAtStartup, true);
    assert.deepEqual(createdViews.map(v => v.webContents.loads), loadsBeforeSettings);
    await handlers.get('board:overlay')(ui(), true);
    assert(createdViews.every(v => !v.visible));
    await handlers.get('board:overlay')(ui(), false);
    assert(createdViews.every(v => v.visible));
    await action('panel:focus', { id: second });
    assert(createdViews[1].webContents.focusCount > 0, 'selecting an account transfers keyboard focus');
    assert.equal(current().layout, 'grid', 'clicking a panel title keeps the Multi layout');
    await action('focus:enter', { id: second });
    assert.equal(current().layout, 'single', 'account navigation enters the preferred focus layout');
    assertZooms([0.6, 1, 0.6, 0.6]);
    assert.equal(createdViews.filter(v => v.visible).length, 1);
    assert.equal(createdViews[1].visible, true);
    // Account switching must wait for the renderer's newly visible slot;
    // the other three live sessions and their contents are kept intact.
    ipcMain.emit('board:bounds', ui(), { [second]: bounds[second] });
    const focusBeforeSwitch = createdViews[0].webContents.focusCount;
    await action('focus:enter', { id: first });
    assertZooms([1, 0.6, 0.6, 0.6]);
    assert.equal(createdViews[0].webContents.focusCount, focusBeforeSwitch);
    ipcMain.emit('board:bounds', ui(), { [first]: bounds[first] });
    assert.equal(createdViews[0].webContents.focusCount, focusBeforeSwitch + 1);
    assert.equal(createdViews.filter(v => v.visible).length, 1);
    assert.equal(current().openIds.length, 4);
    assert.equal(createdViews.length, 4);
    assert.deepEqual(createdViews.map(v => v.webContents.loads), loadsBeforeSettings);
    // Manual adjustments last until a real mode/account change; ordinary
    // state updates, selecting the same tab and page loads do not undo them.
    await action('panel:zoom', { id: first, zoom: 0.9 });
    await action('focus:enter', { id: first });
    await action('layout:set', { layout: 'single' });
    await action('toolbar:toggle');
    await action('toolbar:toggle');
    createdViews[0].webContents.emit('did-finish-load');
    assertZooms([0.9, 0.6, 0.6, 0.6]);
    createdViews[0].webContents.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: '2', control: true });
    assert.equal(current().focusedId, second);
    assert.equal(current().layout, 'single');
    assertZooms([0.6, 1, 0.6, 0.6]);
    // Shell dialogs keep focus until closed, even when a tab is selected.
    await action('layout:set', { layout: 'grid' });
    assertZooms([0.6, 0.6, 0.6, 0.6]);
    ipcMain.emit('board:bounds', ui(), bounds);
    await handlers.get('board:overlay')(ui(), true);
    const focusBeforeDialog = createdViews[1].webContents.focusCount;
    await action('panel:focus', { id: second });
    createdViews[0].webContents.emit('focus');
    assert.equal(current().focusedId, second);
    assert.equal(createdViews[1].webContents.focusCount, focusBeforeDialog);
    await handlers.get('board:overlay')(ui(), false);
    assert.equal(createdViews[1].webContents.focusCount, focusBeforeDialog + 1);
    await action('layout:set', { layout: 'focus' });
    assertZooms([0.6, 0.6, 0.6, 0.6]);
    assert.equal(current().focusLayout, 'focus');
    createdViews[0].webContents.emit('focus');
    assert.equal(current().focusedId, second, 'clicks in small games do not move the large focus panel');
    await action('layout:set', { layout: 'grid' });
    assert.equal(current().focusLayout, 'focus', 'leaving focus keeps the preferred divided mode');
    await action('focus:enter', { id: first });
    assert.equal(current().layout, 'focus', 'account tabs reopen the last focus layout');
    assert.equal(current().focusedId, first);
    await action('layout:set', { layout: 'grid' });
    prevented = false;
    createdViews[0].webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { type: 'keyDown', key: '2', control: true });
    assert.equal(prevented, true);
    assert.equal(current().focusedId, second);
    assert.equal(current().layout, 'focus', 'Ctrl+2 enters the preferred focus mode');
    assert.deepEqual(createdViews.map(v => v.webContents.loads), loadsBeforeSettings);
    assert.deepEqual(createdViews.map(v => v.webContents), nativeContentsBeforeToggle);
    assert.equal(JSON.stringify(current().profiles), profilesBeforeToggle);
    assert.equal(sessions.size, 4);
    assert([...sessions.values()].every(s => !s.cleared));
    await action('layout:set', { layout: 'grid' });
    const guest = v => ({ sender: v.webContents, senderFrame: v.webContents.mainFrame });
    assert.equal((await handlers.get('board:action')(guest(createdViews[0]), 'profile:add', { name: 'Untrusted' })).ok, false);
    assert.equal((await action('game:eco-all')).ok, false, 'unconnected accounts cannot receive Eco commands');
    const stats = { schemaVersion: 1, loggedIn: true, status: 'game_visible', nick: 'Fixture', trainerLevel: 1, trainerXp: { current: 5, target: 100 }, pokemon: { id: '1', name: 'Fixture', level: 1, xpCurrent: 5, xpTarget: 100 }, hunt: 'Fixture' };
    const stateMessages = () => win.webContents.sent.filter(item => item.channel === 'board:state-update').length;
    const beforeStats = stateMessages();
    for (const [index, view] of createdViews.entries()) ipcMain.emit('game:stats', guest(view), { ...stats, economy: index === 0 });
    assert.equal(stateMessages(), beforeStats, 'nearby account snapshots are batched before renderer IPC');
    const pendingUpdates = [...timeouts].filter(([, timer]) => timer.delay === 120);
    assert.equal(pendingUpdates.length, 1);
    assert(Object.values(current().runtime).every(r => r.stats.nick === 'Fixture'));
    const [updateId, updateTimer] = pendingUpdates[0];
    timeouts.delete(updateId); updateTimer.callback();
    assert.equal(stateMessages(), beforeStats + 1, 'four account snapshots require one renderer update');
    const economyRequests = () => createdViews.map(v => v.webContents.sent.filter(x => x.channel === 'game:tool' && x.payload.tool === 'economy-on').length);
    assert.equal((await action('game:eco-all')).ok, true);
    assert.deepEqual(economyRequests(), [0, 1, 1, 1], 'only connected accounts without confirmed Eco receive ON-only commands');
    assert.deepEqual(createdViews.map(v => v.webContents.loads), loadsBeforeSettings);
    assert.equal(sessions.size, 4);
    await action('game:tool', { id: second, tool: 'scan-stones' });
    await action('game:eco-all');
    assert.deepEqual(economyRequests(), [0, 1, 2, 2], 'the account running a market scan is left alone');
    assert.equal(current().tools.market.scanning, true);
    assert.match(current().runtime[second].ecoNotice, /Aguarde a consulta/);
    const thirdBeforeClose = current().openIds[2];
    ipcMain.emit('game:tool-result', guest(createdViews[2]), { tool: 'economy-on', ok: false, error: 'Feche o menu do jogo.' });
    assert.equal(current().runtime[thirdBeforeClose].ecoNotice, 'Feche o menu do jogo.');
    ipcMain.emit('game:tool-result', guest(createdViews[2]), { tool: 'economy-on', ok: true, economy: true });
    assert.equal(current().runtime[thirdBeforeClose].stats.economy, true, 'tool confirmation updates Eco immediately even inside the stats rate limit');
    assert.equal(current().runtime[thirdBeforeClose].ecoNotice, '');
    ipcMain.emit('game:tool-result', guest(createdViews[2]), { tool: 'economy', ok: true, economy: false });
    assert.equal(current().runtime[thirdBeforeClose].stats.economy, false, 'individual toggle also confirms the resulting state');
    await action('farm:start', { id: first });
    await action('farm:stop', { id: first });
    const afterStoppedFarm = stateMessages();
    intervals.find(timer => timer.delay === 5000).callback();
    assert.equal(stateMessages(), afterStoppedFarm, 'a finished measurement does not trigger endless idle redraws');
    await action('game:tool', { id: first, tool: 'scan-stones' });
    assert.equal(current().tools.market.scanning, true);
    createdViews[0].webContents.emit('did-start-navigation', {}, 'https://pokeidle.io/app', false, true);
    assert.equal(current().tools.market.scanning, false);
    assert(current().tools.market.error);
    await action('layout:set', { layout: 'single' });
    await action('panel:focus', { id: second });
    assertZooms([0.6, 1, 0.6, 0.6]);
    await action('game:tool', { id: second, tool: 'lives' });
    assert.equal(current().tools.lives.loading, true);
    await action('panel:close', { id: second });
    assert.equal(current().tools.lives.loading, false);
    assert.equal(createdViews[1].webContents.destroyed, true);
    assert.equal(current().focusedId, first);
    assert.equal(createdViews[0].webContents.zoom, 1, 'closing the focused account gives its replacement 100%');
    assert.equal((await action('focus:enter', { id: second })).ok, false, 'focusing a closed account does not reopen its session');
    assert.equal(current().openIds.includes(second), false);
    const focusAfterClose = current().focusedId;
    createdViews[1].webContents.emit('focus');
    assert.equal(current().focusedId, focusAfterClose);
    const third = current().openIds[1];
    await action('game:tool', { id: third, tool: 'lives' });
    createdViews[2].webContents.emit('render-process-gone');
    assert.equal(current().tools.lives.loading, false);
    assert.equal(current().runtime[third].status, 'error');
    const beforeUnavailableEco = economyRequests();
    await action('game:eco-all');
    assert.deepEqual(economyRequests(), beforeUnavailableEco.map((count, index) => count + (index === 3 ? 1 : 0)), 'loading, closed and crashed accounts are skipped');
    await action('profile:delete', { id: first });
    assert.equal([...sessions.values()].filter(s => s.cleared).length, 1);
    assert.equal(current().profiles.length, 3);
    // Closing and reopening a panel while registration is pending must never
    // navigate the destroyed view or register twice in the same partition.
    await action('profile:add', { name: 'Pending fixture' });
    const pendingId = current().focusedId;
    const cancelled = createdViews.at(-1);
    const pendingSession = cancelled.webContents.session;
    assert.equal(cancelled.webContents.zoom, 1, 'a new account opened in Total starts at 100%');
    await action('panel:close', { id: pendingId });
    await action('panel:open', { id: pendingId });
    const reopened = createdViews.at(-1);
    assert.notEqual(cancelled, reopened);
    assert.equal(reopened.webContents.session, pendingSession);
    assert.equal(reopened.webContents.zoom, 1, 'reopening an account in Total restores the layout zoom');
    assert.equal(pendingSession.extensionLoadCalls, 1);
    pendingSession.finishExtension(false);
    await new Promise(setImmediate);
    assert.equal(cancelled.webContents.mainFrame.url, '');
    assert.equal(reopened.webContents.mainFrame.url, 'https://pokeidle.io/app');
    assert.equal(current().runtime[pendingId].hunt.status, 'error');
    assert.equal(current().runtime[pendingId].status, 'ready');
    assert(current().runtime[pendingId].hunt.error);
  } finally {
    fs.rmSync(dataFolder, { recursive: true, force: true });
  }
});
