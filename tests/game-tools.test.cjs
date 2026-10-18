'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/game-preload.cjs'), 'utf8');

function harness({ stoneCount = 3, cancelAfterFirst = false, loggedIn = true, referenceDelayMs = 0 } = {}) {
  let now = 100_000;
  let pendingReference = null;
  const sent = [], clicked = [], nodes = new Map(), lists = new Map();
  const ipc = new Map(), events = new Map();
  class Element {
    constructor(value = '', classes = '', attrs = {}, onClick = null, key = '') {
      this.textContent = value;
      this.value = '';
      this.hidden = false;
      this.parentElement = null;
      this.style = { display: 'block', visibility: 'visible', opacity: '1' };
      this.getClientRects = () => this.style.display === 'none' || this.hidden ? [] : [{ width: 30, height: 30 }];
      this.classes = new Set(classes.split(' ').filter(Boolean));
      this.classList = { contains: key => this.classes.has(key) };
      this.attrs = attrs;
      this.one = new Map();
      this.many = new Map();
      this.childNodes = [{ nodeType: 3, textContent: value }];
      this.click = () => { clicked.push({ key, at: now }); if (onClick) onClick(); };
      this.scrollIntoView = () => clicked.push({ key: `scroll:${key}`, at: now });
      this.getAttribute = key => this.attrs[key] ?? null;
      this.querySelector = selector => this.one.get(selector) ?? null;
      this.querySelectorAll = selector => this.many.get(selector) ?? [];
      this.dispatchEvent = () => {};
    }
  }
  function put(selector, value = '', classes = '', attrs = {}, onClick) {
    const element = new Element(value, classes, attrs, onClick, selector);
    nodes.set(selector, element);
    return element;
  }
  put('#app', '', loggedIn ? '' : 'hidden');
  put('#portal', '', loggedIn ? 'hidden' : '');
  put('#tr-nick', 'Isgroi');
  put('#tr-level', '17');
  put('#tr-gold', '100');
  put('#tr-xp-txt', '0 / 100 xp');
  put('#tr-diamantes', '0');
  put('#tr-gemas', '0');
  put('#hud-hunt', 'Caterpie');
  put('#modal', '', 'hidden');
  put('#modal-fechar', '', '', {}, () => {
    nodes.get('#modal').classes.add('hidden');
    nodes.delete('#tw-corpo'); nodes.delete('#kk-corpo');
  });
  put('#btn-bolsa');
  put('#cm-historico');
  put('#p-equipe');
  put('#btn-equipe-toggle', '', '', { 'aria-expanded': 'false' }, () => {
    nodes.get('#btn-equipe-toggle').attrs['aria-expanded'] = 'true';
  });
  const htmlClasses = new Set();
  const html = { classList: { contains: key => htmlClasses.has(key) } };
  put('#btn-config', '', '', {}, () => {
    nodes.get('#modal').classes.delete('hidden');
    const toggle = put('#cfg-economia', '', '', { 'aria-checked': 'false' }, () => {
      htmlClasses.add('modo-economia');
      nodes.get('#modal').classes.add('hidden');
      toggle.attrs['aria-checked'] = 'true';
    });
    nodes.set('#cfg-corpo #cfg-economia', toggle);
  });
  put('#eco-sair', '', '', {}, () => htmlClasses.delete('modo-economia'));
  const rows = [];
  for (let i = 1; i <= stoneCount; i += 1) {
    const row = new Element('', 'cmi-linha', { 'data-item': String(i) }, () => {
      for (const r of rows) r.classes.delete('on');
      row.classes.add('on');
      put('#cm-lista .cmi-painel .cmp-switch', '', '', { 'data-moeda': 'gold' });
      const renderReference = () => {
        put('#cm-lista .cmi-painel .cmp-media', i === 3 ? 'Nenhuma venda em 7 dias.' : 'Média vendida em 7 dias');
        if (i === 3) nodes.delete('#cm-lista .cmi-painel .cmp-media .cm-preco');
        else put('#cm-lista .cmi-painel .cmp-media .cm-preco', i === 2 ? '0' : '100');
      };
      if (referenceDelayMs > 0) {
        put('#cm-lista .cmi-painel .cmp-media', 'Carregando…');
        nodes.delete('#cm-lista .cmi-painel .cmp-media .cm-preco');
        pendingReference = { at: now + referenceDelayMs, render: renderReference };
      } else renderReference();
      if (cancelAfterFirst) events.get('pointerdown')?.({ isTrusted: true });
    }, `stone:${i}`);
    row.one.set('.cmi-nome > b', new Element(`Stone ${i}`));
    // Gold zero is real; the 999-gem price must never replace it.
    row.many.set('.cmi-precos .cm-preco', [
      new Element(i === 1 ? '0' : '50', 'cm-preco'),
      new Element('999', 'cm-preco orb'),
    ]);
    rows.push(row);
  }
  const mountMarket = () => {
    nodes.get('#modal').classes.delete('hidden');
    put('#cm-busca');
    put('#cm-lista');
    put('.cm-filtro[data-tipo="item"]');
    put('.cm-filtro[data-cat="stone"]');
    lists.set('#cm-lista .cmi-linha', rows);
  };
  put('.menu-topo button[data-modal="community"]', '', '', {}, mountMarket);
  // A purchase button exists in the fixture and fails the test if ever clicked.
  const purchase = new Element('', '', { 'data-anuncio': '987' }, () => {
    throw new Error('A trade button must never be clicked');
  }, 'FORBIDDEN:buy');
  const listing = new Element('', 'cmv-linha');
  listing.one.set('.cmv-comprar', purchase);
  listing.one.set('.cmv-qtd', new Element('10× unidades'));
  listing.one.set('.cmv-preco .cm-preco', new Element('25', 'cm-preco'));
  lists.set('#cm-lista .cmi-painel .cmv-linha', [listing]);

  function channel(url, label, platform) {
    const a = new Element('', '', { href: url });
    a.one.set(platform === 'twitch' ? '.tw-canal-nome' : '.kk-canal-nome', new Element(label));
    return a;
  }
  lists.set('#tw-corpo a.tw-canal.ao-vivo', [
    channel('https://www.twitch.tv/faasii', 'Faasii', 'twitch'),
    channel('https://evil.example/channel', 'Fake', 'twitch'),
    channel('https://www.twitch.tv.evil.example/fake', 'Fake host', 'twitch'),
    channel('https://www.twitch.tv/settings/security', 'Wrong path', 'twitch'),
    channel('https://user:password@www.twitch.tv/fake', 'Userinfo', 'twitch'),
  ]);
  lists.set('#kk-corpo a.kk-canal.ao-vivo', [channel('https://kick.com/skydalive', 'Sky', 'kick')]);
  for (const platform of ['twitch', 'kick']) {
    put(`#tr-ativos .tr-ativo.${platform}`, '', '', {}, () => {
      nodes.delete('#tw-corpo'); nodes.delete('#kk-corpo');
      put(platform === 'twitch' ? '#tw-corpo' : '#kk-corpo');
    });
  }
  const document = {
    readyState: 'complete', documentElement: html,
    querySelector(selector) { return nodes.get(selector) ?? null; },
    querySelectorAll(selector) { return lists.get(selector) ?? []; },
    addEventListener() {},
  };
  Object.defineProperty(document, 'cookie', { get() { throw Error('cookie forbidden'); } });
  const context = {
    document, location: { origin: 'https://pokeidle.io', pathname: '/app' },
    navigator: { onLine: true }, process: { isMainFrame: true }, URL,
    Event: class { constructor(type) { this.type = type; } },
    Date: class extends Date { static now() { return now; } },
    window: { addEventListener(name, callback) { events.set(name, callback); }, getComputedStyle: element => element.style },
    require(name) {
      assert.equal(name, 'electron');
      return { ipcRenderer: {
        on(name, callback) { ipc.set(name, callback); },
        send(channel, value) { sent.push({ channel, value: JSON.parse(JSON.stringify(value)) }); },
      } };
    },
    setTimeout(callback, ms) {
      now += ms;
      if (pendingReference && now >= pendingReference.at) {
        pendingReference.render();
        pendingReference = null;
      }
      queueMicrotask(callback);
      return 1;
    },
    setInterval() { return 1; }, clearInterval() {},
  };
  for (const key of ['localStorage', 'sessionStorage', 'fetch', 'WebSocket']) {
    Object.defineProperty(context, key, { get() { throw Error(`${key} forbidden`); } });
  }
  vm.runInNewContext(source, context);
  return {
    sent, clicked, nodes, rows, context, put, htmlClasses, events,
    fire(tool, extra = {}) { ipc.get('game:tool')({}, { tool, ...extra }); },
    async run(tool, extra = {}) {
      ipc.get('game:tool')({}, { tool, ...extra });
      for (let i = 0; i < 500; i += 1) await Promise.resolve();
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('explicit stone scan separates gold, preserves zero, reads 7-day mean and handles no sales', async () => {
  const h = harness();
  await h.run('scan-stones');
  const market = h.sent.filter(x => x.channel === 'game:market').at(-1).value;
  assert.equal(market.scanning, false);
  assert.equal(market.available, true);
  assert.equal(market.scanned, 3);
  assert.equal(market.source, 'visible-dom');
  assert.deepEqual(market.catalog[0], {
    itemId: '1', name: 'Stone 1', currency: 'gold', minUnitPrice: 0, average7d: 100, belowPercent: 100,
  });
  assert.equal(market.catalog[1].average7d, 0);
  assert.equal(market.catalog[1].belowPercent, null);
  assert.equal(market.catalog[2].average7d, null);
  assert.equal(market.catalog[2].belowPercent, null);
  const selections = h.clicked.filter(x => x.key.startsWith('stone:'));
  for (let i = 1; i < selections.length; i += 1) assert.ok(selections[i].at - selections[i - 1].at >= 750);
  assert.ok(!h.clicked.some(x => x.key.includes('FORBIDDEN')));
});

test('stone scan is capped at 32 entries and can be interrupted by the user', async () => {
  const full = harness({ stoneCount: 35 });
  await full.run('scan-stones');
  const market = full.sent.filter(x => x.channel === 'game:market').at(-1).value;
  assert.equal(market.total, 32);
  assert.equal(market.scanned, 32);
  assert.equal(market.limited, true);
  assert.equal(full.clicked.filter(x => x.key.startsWith('stone:')).length, 32);

  const canceled = harness({ cancelAfterFirst: true });
  await canceled.run('scan-stones');
  const final = canceled.sent.filter(x => x.channel === 'game:market').at(-1).value;
  assert.equal(final.scanning, false);
  assert.match(final.error, /cancelada/);
  assert.equal(canceled.clicked.filter(x => x.key.startsWith('stone:')).length, 1);
});

test('view-stone reads unit and lot prices without purchasing', async () => {
  const h = harness();
  await h.run('view-stone', { itemId: '1' });
  const market = h.sent.filter(x => x.channel === 'game:market').at(-1).value;
  assert.equal(market.selectedItemId, '1');
  assert.equal(market.catalog.length, 1);
  assert.deepEqual(market.listings, [{ id: '987', quantity: 10, currency: 'gold', unitPrice: 25, totalPrice: 250 }]);
  assert.ok(!h.clicked.some(x => x.key.includes('FORBIDDEN')));

  await h.run('scan-stones');
  h.rows[0].many.get('.cmi-precos .cm-preco')[0].textContent = '30';
  await h.run('view-stone', { itemId: '1' });
  const refreshed = h.sent.filter(x => x.channel === 'game:market').at(-1).value;
  assert.equal(refreshed.catalog.length, 3);
  assert.equal(refreshed.scanned, 3);
  assert.equal(refreshed.catalog[0].minUnitPrice, 30);
  assert.equal(refreshed.catalog[0].belowPercent, 70);
  assert.equal(refreshed.catalog[1].average7d, 0);
  assert.equal(refreshed.selectedItemId, '1');
});

test('stone scan waits for a loading reference instead of treating it as missing', async () => {
  const h = harness({ referenceDelayMs: 1_100 });
  await h.run('scan-stones');
  const market = h.sent.filter(x => x.channel === 'game:market').at(-1).value;
  assert.equal(market.scanned, 3);
  assert.equal(market.catalog[0].average7d, 100);
  assert.equal(market.catalog[1].average7d, 0);
  assert.equal(market.catalog[2].average7d, null);
});

test('lives reads only channel URLs on Twitch/Kick and never clicks linking/authentication controls', async () => {
  const h = harness();
  await h.run('lives');
  const result = h.sent.filter(x => x.channel === 'game:lives').at(-1).value;
  assert.equal(result.available, true);
  assert.deepEqual(result.links, [
    { platform: 'twitch', label: 'Faasii', url: 'https://www.twitch.tv/faasii' },
    { platform: 'kick', label: 'Sky', url: 'https://kick.com/skydalive' },
  ]);
  assert.deepEqual(h.clicked.map(x => x.key), [
    '#tr-ativos .tr-ativo.twitch', '#tr-ativos .tr-ativo.kick', '#modal-fechar',
  ]);
});

test('panel tools open inventory, sales history, team and toggle the official economy control', async () => {
  const h = harness();
  await h.run('items');
  await h.run('sales');
  await h.run('team');
  await h.run('economy');
  let stats = h.sent.filter(x => x.channel === 'game:stats').at(-1).value;
  assert.equal(stats.economy, true);
  await h.run('economy');
  stats = h.sent.filter(x => x.channel === 'game:stats').at(-1).value;
  assert.equal(stats.economy, false);
  for (const key of ['#btn-bolsa', '#cm-historico', '#btn-equipe-toggle', '#cfg-economia', '#eco-sair']) {
    assert.ok(h.clicked.some(x => x.key === key), key);
  }
  assert.ok(!h.clicked.some(x => /comprar|vender|vincular|FORBIDDEN/.test(x.key)));
});

test('unknown tools, injection-like IDs and logged-out scans cannot cause trades or navigation', async () => {
  const h = harness();
  await h.run('buy');
  await h.run('view-stone', { itemId: '1"] .cmv-comprar' });
  assert.equal(h.clicked.length, 0);
  const loggedOut = harness({ loggedIn: false });
  await loggedOut.run('scan-stones');
  assert.equal(loggedOut.clicked.length, 0);
  const market = loggedOut.sent.filter(x => x.channel === 'game:market').at(-1).value;
  assert.equal(market.available, false);
  assert.equal(market.scanning, false);
});

test('Eco all uses an explicit OFF switch once and never turns an active economy mode off', async () => {
  const h = harness();
  await h.run('economy-on');
  assert.equal(h.sent.filter(x => x.channel === 'game:stats').at(-1).value.economy, true);
  assert.deepEqual(h.clicked.map(x => x.key), ['#btn-config', '#cfg-economia']);
  await h.run('economy-on');
  assert.deepEqual(h.clicked.map(x => x.key), ['#btn-config', '#cfg-economia'], 'already ON is a no-op');
  assert.equal(h.sent.filter(x => x.channel === 'game:tool-result').at(-1).value.ok, true);
  assert.equal(h.sent.filter(x => x.channel === 'game:tool-result').at(-1).value.economy, true);
  await h.run('economy');
  assert.equal(h.sent.filter(x => x.channel === 'game:stats').at(-1).value.economy, false, 'individual toggle still restores the normal scene');
  assert.equal(h.sent.filter(x => x.channel === 'game:tool-result').at(-1).value.economy, false);
});

test('Eco all prefers visible ON-only shortcuts and ignores shortcuts hidden by ancestors or CSS', async () => {
  const visible = harness();
  visible.put('#hunt-eco', '', '', {}, () => visible.htmlClasses.add('modo-economia'));
  await visible.run('economy-on');
  assert.deepEqual(visible.clicked.map(x => x.key), ['#hunt-eco']);
  for (const hiddenBy of ['ancestor', 'css']) {
    const h = harness();
    const shortcut = h.put('#hunt-eco', '', '', {}, () => { throw new Error('hidden shortcut was clicked'); });
    if (hiddenBy === 'ancestor') shortcut.parentElement = h.put('#hidden-hunt', '', 'hidden');
    else shortcut.style.visibility = 'hidden';
    await h.run('economy-on');
    assert.deepEqual(h.clicked.map(x => x.key), ['#btn-config', '#cfg-economia']);
  }
});

test('Eco all leaves active queries, game dialogs and disconnected accounts alone', async () => {
  for (const alreadyOn of [false, true]) {
    const h = harness();
    if (alreadyOn) h.htmlClasses.add('modo-economia');
    h.fire('scan-stones');
    await h.run('economy-on');
    const market = h.sent.filter(x => x.channel === 'game:market').at(-1).value;
    assert.equal(market.scanned, 3, 'scan continues to completion');
    assert.equal(market.error ?? '', '');
    assert(!h.clicked.some(x => ['#btn-config', '#cfg-economia', '#eco-sair'].includes(x.key)));
    assert.equal(h.sent.filter(x => x.channel === 'game:tool-result' && x.value.tool === 'economy-on').at(-1).value.ok, alreadyOn);
  }
  const modal = harness();
  modal.nodes.get('#modal').classes.delete('hidden');
  await modal.run('economy-on');
  assert.equal(modal.clicked.length, 0);
  assert.match(modal.sent.filter(x => x.channel === 'game:tool-result').at(-1).value.error, /Feche o menu/);
  for (const h of [harness({ loggedIn: false }), harness()]) {
    h.context.navigator.onLine = false;
    await h.run('economy-on');
    assert.equal(h.clicked.length, 0);
    assert.equal(h.sent.filter(x => x.channel === 'game:tool-result').at(-1).value.ok, false);
  }
});

test('Eco all requires a confirmed OFF switch and yields to a real game interaction', async () => {
  const unknown = harness();
  unknown.nodes.get('#btn-config').click = () => {
    const toggle = unknown.put('#cfg-corpo #cfg-economia', '', '', { 'aria-checked': 'true' });
    toggle.click = () => { throw new Error('unconfirmed toggle must not be clicked'); };
  };
  await unknown.run('economy-on');
  assert.equal(unknown.htmlClasses.has('modo-economia'), false);
  assert.equal(unknown.sent.filter(x => x.channel === 'game:tool-result').at(-1).value.ok, false);
  const interrupted = harness();
  interrupted.nodes.get('#btn-config').click = () => {
    interrupted.events.get('pointerdown')({ isTrusted: true });
  };
  await interrupted.run('economy-on');
  assert.equal(interrupted.htmlClasses.has('modo-economia'), false);
  assert(!interrupted.clicked.some(x => x.key === '#cfg-economia'));
});
