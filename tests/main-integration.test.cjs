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
    focus() {}
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
    setBounds(value) { this.bounds = value; }
    setVisible(value) { this.visible = value; }
    setBackgroundColor() {} setBorderRadius() {}
  }
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, setAppUserModelId() {}, getVersion: () => '1.0.1', getPath: () => dataFolder, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {} });
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
      setTimeout: () => 1, clearTimeout() {}, setInterval: () => ({ unref() {} }),
    }, { filename: 'main.cjs' });
    await new Promise(setImmediate);
    const ui = () => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
    const action = (name, payload) => handlers.get('board:action')(ui(), name, payload);
    const current = () => handlers.get('board:state')(ui());
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
    const [first, second] = current().openIds;
    const bounds = Object.fromEntries(current().openIds.map((id, i) => [id, { x: i % 2 * 640, y: Math.floor(i / 2) * 400 + 40, width: 630, height: 350 }]));
    ipcMain.emit('board:bounds', ui(), bounds);
    assert(createdViews.every(v => v.visible));
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
    await action('layout:set', { layout: 'single' });
    assert.equal(createdViews.filter(v => v.visible).length, 1);
    assert.equal(createdViews[1].visible, true);
    const guest = v => ({ sender: v.webContents, senderFrame: v.webContents.mainFrame });
    assert.equal((await handlers.get('board:action')(guest(createdViews[0]), 'profile:add', { name: 'Untrusted' })).ok, false);
    const stats = { schemaVersion: 1, loggedIn: true, status: 'game_visible', nick: 'Fixture', trainerLevel: 1, trainerXp: { current: 5, target: 100 }, pokemon: { id: '1', name: 'Fixture', level: 1, xpCurrent: 5, xpTarget: 100 }, hunt: 'Fixture' };
    for (const view of createdViews) ipcMain.emit('game:stats', guest(view), stats);
    await action('game:tool', { id: first, tool: 'scan-stones' });
    assert.equal(current().tools.market.scanning, true);
    createdViews[0].webContents.emit('did-start-navigation', {}, 'https://pokeidle.io/app', false, true);
    assert.equal(current().tools.market.scanning, false);
    assert(current().tools.market.error);
    await action('game:tool', { id: second, tool: 'lives' });
    assert.equal(current().tools.lives.loading, true);
    await action('panel:close', { id: second });
    assert.equal(current().tools.lives.loading, false);
    assert.equal(createdViews[1].webContents.destroyed, true);
    const third = current().openIds[1];
    await action('game:tool', { id: third, tool: 'lives' });
    createdViews[2].webContents.emit('render-process-gone');
    assert.equal(current().tools.lives.loading, false);
    assert.equal(current().runtime[third].status, 'error');
    await action('profile:delete', { id: first });
    assert.equal([...sessions.values()].filter(s => s.cleared).length, 1);
    assert.equal(current().profiles.length, 3);
    // Closing and reopening a panel while registration is pending must never
    // navigate the destroyed view or register twice in the same partition.
    await action('profile:add', { name: 'Pending fixture' });
    const pendingId = current().focusedId;
    const cancelled = createdViews.at(-1);
    const pendingSession = cancelled.webContents.session;
    await action('panel:close', { id: pendingId });
    await action('panel:open', { id: pendingId });
    const reopened = createdViews.at(-1);
    assert.notEqual(cancelled, reopened);
    assert.equal(reopened.webContents.session, pendingSession);
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
