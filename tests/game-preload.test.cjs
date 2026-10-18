'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createFarmTracker, xpDelta } = require('../app/farm-metrics.cjs');

const source = fs.readFileSync(path.join(__dirname, '../app/game-preload.cjs'), 'utf8');

class Element {
  constructor(text = '', classes = '', attributes = {}) {
    this.textContent = text;
    this.hidden = false;
    this.attributes = { ...attributes };
    this.classes = new Set(classes.split(' ').filter(Boolean));
    this.classList = { contains: value => this.classes.has(value) };
    this.childrenBySelector = new Map();
    this.childNodes = [{ nodeType: 3, textContent: text }];
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelector(selector) { return this.childrenBySelector.get(selector) ?? null; }
}

function fixture({ origin = 'https://pokeidle.io', pathname = '/app', loading = false, mainFrame = true } = {}) {
  let now = 10_000;
  const sent = [];
  const timers = [];
  const listeners = new Map();
  const docListeners = new Map();
  const nodes = new Map();
  function node(selector, text, classes, attrs) {
    const element = new Element(text, classes, attrs);
    nodes.set(selector, element);
    return element;
  }
  node('#app', '', 'app');
  node('#portal', '', 'portal hidden');
  node('#tr-nick', 'Isgroi');
  node('#tr-level', '17');
  node('#tr-gold', '1.234.567');
  node('#tr-diamantes', '5');
  node('#tr-gemas', '0');
  node('#tr-xp-txt', '2.500 / 5.000 xp');
  node('#hud-hunt', 'Caterpie · Nv 10');
  node('#time .poke-linha.ativo', '', 'poke-linha ativo', { 'data-id': 'pk-42' });
  node('#sessao-tomada', '', 'modal hidden');
  node('#alerta-conta', '', 'modal hidden');
  node('#hud-log > div:first-child', 'Você recebeu XP.');
  const card = node('#ativo-card', '', 'ativo-card brilho-shiny');
  const name = new Element('✨ Shiny Bulbasaur Nv 17');
  name.childNodes = [
    { nodeType: 1, textContent: '' }, // crown image
    { nodeType: 3, textContent: '✨ Shiny Bulbasaur' },
    { nodeType: 1, textContent: '+3' }, // refinement badge
    { nodeType: 3, textContent: ' ' },
    { nodeType: 1, textContent: 'Nv 17' },
  ];
  card.childrenBySelector.set('.ativo-nome', name);
  card.childrenBySelector.set('.pl-lv', new Element('Nv 17'));
  card.childrenBySelector.set('.barra.hp > span', new Element('500 / 1000'));
  card.childrenBySelector.set('.barra.xp > span', new Element('1.500 / 3.000 xp'));
  const document = {
    readyState: loading ? 'loading' : 'complete',
    querySelector(selector) {
      assert.ok(!/password|senha|login-|email/i.test(selector), 'must not read login inputs');
      return nodes.get(selector) ?? null;
    },
    addEventListener(name, callback) { docListeners.set(name, callback); },
  };
  Object.defineProperty(document, 'cookie', { get() { throw Error('cookie access forbidden'); } });
  const navigator = { onLine: true };
  const context = {
    document,
    navigator,
    location: { origin, pathname },
    process: { isMainFrame: mainFrame },
    window: { addEventListener(name, callback) { listeners.set(name, callback); } },
    require(name) {
      assert.equal(name, 'electron');
      return { ipcRenderer: { on() {}, send(channel, payload) {
        sent.push({ channel, payload: JSON.parse(JSON.stringify(payload)) });
      } } };
    },
    setInterval(callback, delay) { const timer = { callback, delay, active: true }; timers.push(timer); return timer; },
    clearInterval(timer) { timer.active = false; },
    Date: class extends Date { static now() { return now; } },
  };
  for (const name of ['localStorage', 'sessionStorage', 'fetch', 'WebSocket']) {
    Object.defineProperty(context, name, { get() { throw Error(`${name} access forbidden`); } });
  }
  vm.runInNewContext(source, context, { filename: 'game-preload.cjs' });
  return {
    sent, nodes, card, timers, listeners, docListeners, navigator, context,
    tick(ms = 2_000) { now += ms; for (const timer of timers) if (timer.active) timer.callback(); },
  };
}

test('reads official rendered selectors, preserves IDs, excludes badges and credentials', () => {
  const f = fixture();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].channel, 'game:stats');
  const snapshot = f.sent[0].payload;
  assert.equal(snapshot.loggedIn, true);
  assert.equal(snapshot.nick, 'Isgroi');
  assert.equal(snapshot.gold, 1234567);
  assert.equal(snapshot.gems, 0);
  assert.deepEqual(snapshot.trainerXp, { current: 2500, target: 5000, percent: 50 });
  assert.deepEqual(snapshot.pokemon, {
    id: 'pk-42', name: '✨ Shiny Bulbasaur', level: 17,
    hp: 500, maxHp: 1000, xpCurrent: 1500, xpTarget: 3000,
  });
  assert.equal(snapshot.hunt, 'Caterpie · Nv 10');
  assert.equal(snapshot.status, 'game_visible');
  assert.equal(f.timers[0].delay, 2000);
});

test('deduplicates unchanged samples while delivering a 30-second heartbeat', () => {
  const f = fixture();
  f.tick();
  assert.equal(f.sent.length, 1);
  f.tick(27_999);
  assert.equal(f.sent.length, 1);
  f.tick(1);
  assert.equal(f.sent.length, 2);
  f.nodes.get('#tr-gold').textContent = '1.234.568';
  f.tick();
  assert.equal(f.sent.length, 3);
  assert.equal(f.sent[2].payload.gold, 1234568);
});

test('logout clears all stale character data even if the game DOM retains it', () => {
  const f = fixture();
  f.nodes.get('#portal').classes.delete('hidden');
  f.nodes.get('#app').classes.add('hidden');
  f.tick();
  const snapshot = f.sent.at(-1).payload;
  assert.equal(snapshot.loggedIn, false);
  assert.equal(snapshot.status, 'login');
  for (const key of ['nick', 'trainerLevel', 'gold', 'diamonds', 'gems', 'trainerXp', 'pokemon', 'hunt']) {
    assert.equal(snapshot[key], null, key);
  }
});

test('does not attach to other origins, auth/terms pages or subframes', () => {
  for (const options of [
    { origin: 'https://pokeidle.io.evil.example' },
    { origin: 'http://pokeidle.io' },
    { origin: 'https://accounts.google.com' },
    { pathname: '/terms' },
    { pathname: '/auth/google' },
    { mainFrame: false },
  ]) {
    const f = fixture(options);
    assert.equal(f.sent.length, 0);
    assert.equal(f.timers.length, 0);
  }
});

test('waits for DOMContentLoaded and stops polling on pagehide', () => {
  const f = fixture({ loading: true });
  assert.equal(f.sent.length, 0);
  f.docListeners.get('DOMContentLoaded')();
  assert.equal(f.sent.length, 1);
  f.listeners.get('pagehide')();
  f.tick(60_000);
  assert.equal(f.sent.length, 1);
});

test('malformed/unsafe counters remain unavailable; raw HP decimals are not thousands', () => {
  const f = fixture();
  f.nodes.get('#tr-gold').textContent = '9007199254740993';
  f.nodes.get('#tr-gemas').textContent = 'not a number';
  f.nodes.get('#tr-xp-txt').textContent = '510 / 500 xp';
  f.card.childrenBySelector.get('.barra.hp > span').textContent = '123.5 / 1000';
  f.tick();
  const snapshot = f.sent.at(-1).payload;
  assert.equal(snapshot.gold, null);
  assert.equal(snapshot.gems, null);
  assert.equal(snapshot.trainerXp, null);
  assert.equal(snapshot.pokemon.hp, 123.5);
  assert.equal(snapshot.pokemon.maxHp, 1000);
});

test('distinguishes fainting, reconnecting and an account opened elsewhere', () => {
  const f = fixture();
  f.card.childrenBySelector.get('.barra.hp > span').textContent = '0 / 1000';
  f.tick();
  assert.equal(f.sent.at(-1).payload.status, 'fainted');
  f.nodes.get('#hud-log > div:first-child').textContent = 'Reconectando…';
  f.tick();
  assert.equal(f.sent.at(-1).payload.status, 'reconnecting');
  f.nodes.get('#sessao-tomada').classes.delete('hidden');
  f.tick();
  assert.equal(f.sent.at(-1).payload.status, 'session_elsewhere');
});

test('XP delta counts a single level rollover and rejects unobserved levels/resets', () => {
  const p = { level: 10, current: 190, target: 200 };
  assert.equal(xpDelta(p, { level: 10, current: 195, target: 200 }), 5);
  assert.equal(xpDelta(p, { level: 11, current: 30, target: 400 }), 40);
  assert.equal(xpDelta(p, { level: 12, current: 30, target: 800 }), null);
  assert.equal(xpDelta(p, { level: 10, current: 10, target: 200 }), null);
  assert.equal(xpDelta(p, { level: 10, current: 195, target: 400 }), null);
});

function farmSnapshot(overrides = {}) {
  return {
    schemaVersion: 1, at: 0, loggedIn: true, nick: 'Isgroi', trainerLevel: 10,
    gold: 500, trainerXp: { current: 100, target: 200, percent: 50 },
    pokemon: { id: 'pk-42', name: 'Bulbasaur', level: 17, xpCurrent: 70, xpTarget: 1000 },
    hunt: 'Caterpie · Nv 10', status: 'game_visible', ...overrides,
  };
}

test('farm rates wait for a full minute and gold is the signed net balance change', () => {
  const tracker = createFarmTracker();
  let result = tracker.update(farmSnapshot());
  assert.equal(result.ready, false);
  assert.equal(result.trainerXpPerHour, null);
  result = tracker.update(farmSnapshot({ at: 30_000, gold: 550,
    trainerXp: { current: 160, target: 200 },
    pokemon: { id: 'pk-42', name: 'Bulbasaur', level: 17, xpCurrent: 80, xpTarget: 1000 },
  }));
  assert.equal(result.ready, false);
  result = tracker.update(farmSnapshot({ at: 60_000, gold: 480, trainerLevel: 11,
    trainerXp: { current: 30, target: 400 },
    pokemon: { id: 'pk-42', name: 'Bulbasaur', level: 17, xpCurrent: 90, xpTarget: 1000 },
  }));
  assert.equal(result.ready, true);
  assert.equal(result.trainerXpGain, 130);
  assert.equal(result.trainerXpPerHour, 7800);
  assert.equal(result.pokemonXpGain, 20);
  assert.equal(result.pokemonXpPerHour, 1200);
  assert.equal(result.goldDelta, -20);
  assert.equal(result.goldPerHour, -1200);
});

test('farm discards intervals across disconnects, account/pokemon/hunt changes and gaps', () => {
  const tracker = createFarmTracker();
  tracker.update(farmSnapshot());
  let result = tracker.update(farmSnapshot({ at: 2000, status: 'reconnecting' }));
  assert.equal(result.valid, false);
  tracker.update(farmSnapshot({ at: 4000 }));
  result = tracker.update(farmSnapshot({ at: 6000,
    pokemon: { id: 'pk-another', name: 'Bulbasaur', level: 17, xpCurrent: 70, xpTarget: 1000 },
  }));
  assert.equal(result.reason, 'pokemon_changed');
  assert.equal(result.samples, 1);
  result = tracker.update(farmSnapshot({ at: 8000, nick: 'OutraConta' }));
  assert.equal(result.reason, 'account_changed');
  result = tracker.update(farmSnapshot({ at: 60_000, nick: 'OutraConta' }));
  assert.equal(result.reason, 'observation_gap');
  result = tracker.update(farmSnapshot({ at: 62_000, nick: 'OutraConta', hunt: 'Weedle' }));
  assert.equal(result.reason, 'hunt_changed');
  result = tracker.update({ loggedIn: false });
  assert.equal(result.reason, 'logged_out');
  assert.equal(result.goldDelta, null);
});

test('farm does not invent XP for skipped levels or an unknown Pokémon identity', () => {
  const tracker = createFarmTracker();
  tracker.update(farmSnapshot());
  const result = tracker.update(farmSnapshot({ at: 2000, trainerLevel: 12,
    trainerXp: { current: 10, target: 800 },
  }));
  assert.equal(result.reason, 'xp_discontinuity');
  assert.equal(result.trainerXpGain, 0);
  tracker.reset();
  const withoutId = farmSnapshot({ pokemon: { name: 'Bulbasaur', level: 17, xpCurrent: 70, xpTarget: 1000 } });
  assert.equal(tracker.update(withoutId).pokemonXpGain, null);
});
