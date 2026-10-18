'use strict';

const { randomUUID } = require('node:crypto');

const GAME_URL = 'https://pokeidle.io/app';
const MAX_PROFILES = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THEMES = ['blue'];
const PROFILE_COLORS = ['#77aaff', '#57bbff', '#6d93ff', '#91c7ff', '#488fe6', '#779dd8'];
const LAYOUTS = ['grid', 'focus', 'single'];
const FOCUS_LAYOUTS = ['single', 'focus'];

function text(value, max = 64) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

function number(value, fallback = null, max = 1e15) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : fallback;
}

function color(value) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  return PROFILE_COLORS.includes(normalized) ? normalized : PROFILE_COLORS[0];
}
function zoom(value) { return typeof value === 'number' && Number.isFinite(value) ? Math.min(1.5, Math.max(0.35, Math.round(value * 100) / 100)) : 0.6; }
function partitionFor(id) {
  if (!UUID.test(id)) throw new Error('Identificador de conta inválido.');
  return `persist:isgroi-${id}`;
}

function initialState() {
  return { schemaVersion: 1, profiles: [], openIds: [], focusedId: null, layout: 'grid', focusLayout: 'single', theme: 'blue', keepAwake: false, sidebarCollapsed: false, toolbarHidden: false, huntEnabled: true, trials: [] };
}

function cleanTrial(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const elapsedMs = number(raw.elapsedMs, 0, 365 * 24 * 3600 * 1000);
  if (elapsedMs < 1000) return null;
  const trainerXp = number(raw.trainerXp);
  const pokemonXp = number(raw.pokemonXp);
  const endedAt = number(raw.endedAt, Date.now());
  return {
    id: UUID.test(raw.id) ? raw.id : randomUUID(),
    profileName: text(raw.profileName, 32) || 'Conta',
    hunt: text(raw.hunt, 100) || 'Hunt não identificada',
    pokemonName: text(raw.pokemonName, 80) || 'Pokémon',
    elapsedMs, trainerXp, pokemonXp,
    goldDelta: typeof raw.goldDelta === 'number' && Number.isFinite(raw.goldDelta) && Math.abs(raw.goldDelta) <= 1e15 ? raw.goldDelta : null,
    trainerXpPerHour: trainerXp === null ? null : trainerXp * 3600000 / elapsedMs,
    pokemonXpPerHour: pokemonXp === null ? null : pokemonXp * 3600000 / elapsedMs,
    endedAt,
    notice: text(raw.notice, 200),
  };
}

function restoreState(raw) {
  const s = initialState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  const ids = new Set();
  for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
    if (!p || !UUID.test(p.id) || ids.has(p.id) || s.profiles.length === MAX_PROFILES) continue;
    ids.add(p.id);
    const savedColor = typeof p.color === 'string' ? p.color.toLowerCase() : '';
    const profileColor = PROFILE_COLORS.includes(savedColor) ? savedColor : PROFILE_COLORS[s.profiles.length % PROFILE_COLORS.length];
    s.profiles.push({ id: p.id, name: text(p.name, 32) || `Conta ${s.profiles.length + 1}`, color: profileColor, zoom: zoom(p.zoom), muted: p.muted !== false, createdAt: number(p.createdAt, Date.now()) });
  }
  s.openIds = [...new Set(Array.isArray(raw.openIds) ? raw.openIds : [])].filter(id => ids.has(id)).slice(0, MAX_PROFILES);
  s.focusedId = s.openIds.includes(raw.focusedId) ? raw.focusedId : s.openIds[0] || null;
  if (THEMES.includes(raw.theme)) s.theme = raw.theme;
  if (LAYOUTS.includes(raw.layout)) s.layout = raw.layout;
  s.focusLayout = FOCUS_LAYOUTS.includes(raw.focusLayout) ? raw.focusLayout : raw.layout === 'focus' ? 'focus' : 'single';
  s.keepAwake = raw.keepAwake === true;
  s.sidebarCollapsed = raw.sidebarCollapsed === true;
  s.toolbarHidden = raw.toolbarHidden === true;
  s.huntEnabled = raw.huntEnabled !== false;
  s.trials = (Array.isArray(raw.trials) ? raw.trials : []).slice(0, 200).map(cleanTrial).filter(Boolean);
  return s;
}

function sanitizeStats(raw, now = Date.now()) {
  if (!raw || raw.schemaVersion !== 1) return null;
  if (raw.loggedIn !== true) return { schemaVersion: 1, at: now, loggedIn: false, status: ['session_elsewhere', 'account_alert', 'offline', 'reconnecting', 'layout_unavailable'].includes(raw.status) ? raw.status : 'login', nick: '', pokemon: null, trainerXp: null, gold: null, economy: null };
  const xp = raw.trainerXp && typeof raw.trainerXp === 'object' ? raw.trainerXp : {};
  const p = raw.pokemon && typeof raw.pokemon === 'object' ? raw.pokemon : {};
  return {
    schemaVersion: 1, at: now, loggedIn: true,
    status: ['game_visible', 'fainted', 'session_elsewhere', 'account_alert', 'offline', 'reconnecting', 'layout_unavailable'].includes(raw.status) ? raw.status : 'game_visible',
    nick: text(raw.nick, 80), trainerLevel: number(raw.trainerLevel, null, 1e6),
    gold: number(raw.gold), diamonds: number(raw.diamonds), gems: number(raw.gems),
    trainerXp: { current: number(xp.current), target: number(xp.target), percent: number(xp.percent, null, 100) },
    pokemon: {
      id: text(String(p.id ?? ''), 100), name: text(p.name, 80),
      level: number(p.level, null, 1e6), hp: number(p.hp), maxHp: number(p.maxHp),
      xpCurrent: number(p.xpCurrent), xpTarget: number(p.xpTarget),
    },
    hunt: text(raw.hunt, 100), economy: typeof raw.economy === 'boolean' ? raw.economy : null,
  };
}

function isGameURL(value) {
  try { const u = new URL(value); return u.origin === 'https://pokeidle.io' && !u.username && !u.password; } catch { return false; }
}

function allowedNavigation(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    if (u.hostname === 'pokeidle.io') return true;
    if (u.hostname === 'accounts.google.com') return true;
    if (u.hostname === 'discord.com') return /^\/(oauth2|login|register|authorize|api\/oauth2)(\/|$)/.test(u.pathname);
    return false;
  } catch { return false; }
}

function cleanBounds(raw, size) {
  if (!raw || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(raw[k]))) return null;
  const x = Math.max(0, Math.min(size[0], Math.round(raw.x)));
  const y = Math.max(0, Math.min(size[1], Math.round(raw.y)));
  const width = Math.max(0, Math.min(size[0] - x, Math.round(raw.width)));
  const height = Math.max(0, Math.min(size[1] - y, Math.round(raw.height)));
  return width >= 20 && height >= 20 ? { x, y, width, height } : null;
}

function liveURL(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    if (!['www.twitch.tv', 'twitch.tv', 'kick.com', 'www.kick.com'].includes(u.hostname)) return null;
    if (!/^\/[A-Za-z0-9_][A-Za-z0-9_-]{0,59}\/?$/.test(u.pathname)) return null;
    return `https://${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}

function sanitizeMarket(raw, profileId, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const catalog = [];
  const ids = new Set();
  for (const item of (Array.isArray(raw.catalog) ? raw.catalog : []).slice(0, 32)) {
    if (!item || typeof item.itemId !== 'string' || !/^[A-Za-z0-9_:-]{1,64}$/.test(item.itemId) || ids.has(item.itemId) || item.currency !== 'gold') continue;
    ids.add(item.itemId);
    const minUnitPrice = number(item.minUnitPrice);
    const average7d = number(item.average7d);
    catalog.push({ itemId: item.itemId, name: text(item.name, 100) || item.itemId, currency: 'gold', minUnitPrice, average7d, belowPercent: minUnitPrice !== null && average7d !== null && average7d > 0 ? (average7d - minUnitPrice) / average7d * 100 : null });
  }
  return { profileId, source: 'visible-dom', available: raw.available === true, scanning: raw.scanning === true, scanned: number(raw.scanned, 0, 32), total: number(raw.total, catalog.length, 32), at: now, catalog, error: text(raw.error, 240), note: text(raw.note, 240) };
}

function sanitizeLives(raw, profileId, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const links = [];
  const seen = new Set();
  for (const link of (Array.isArray(raw.links) ? raw.links : []).slice(0, 100)) {
    const url = liveURL(link?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, label: text(link.label, 80) || new URL(url).pathname.slice(1), platform: new URL(url).hostname === 'twitch.tv' ? 'twitch' : 'kick' });
  }
  return { profileId, source: 'visible-dom', available: raw.available === true, at: now, links, error: text(raw.error, 240) };
}

function exportPreferences(state) {
  return { app: 'IdleBoard Isgroi', schemaVersion: 1, exportedAt: new Date().toISOString(), settings: { theme: state.theme, layout: state.layout, focusLayout: state.focusLayout, sidebarCollapsed: state.sidebarCollapsed, toolbarHidden: state.toolbarHidden === true, huntEnabled: state.huntEnabled !== false }, trials: state.trials.map(cleanTrial).filter(Boolean) };
}

function importPreferences(state, raw) {
  if (!raw || raw.app !== 'IdleBoard Isgroi' || raw.schemaVersion !== 1) throw new Error('Este arquivo não é um backup de preferências do IdleBoard Isgroi.');
  const p = raw.settings || {};
  if (THEMES.includes(p.theme)) state.theme = p.theme;
  if (LAYOUTS.includes(p.layout)) state.layout = p.layout;
  if (FOCUS_LAYOUTS.includes(p.focusLayout)) state.focusLayout = p.focusLayout;
  else if (FOCUS_LAYOUTS.includes(p.layout)) state.focusLayout = p.layout;
  if (typeof p.sidebarCollapsed === 'boolean') state.sidebarCollapsed = p.sidebarCollapsed;
  if (typeof p.toolbarHidden === 'boolean') state.toolbarHidden = p.toolbarHidden;
  if (typeof p.huntEnabled === 'boolean') state.huntEnabled = p.huntEnabled;
  const trials = (Array.isArray(raw.trials) ? raw.trials : []).slice(0, 200).map(cleanTrial).filter(Boolean);
  const byId = new Map(state.trials.map(t => [t.id, t]));
  for (const trial of trials) if (!byId.has(trial.id)) byId.set(trial.id, trial);
  state.trials = [...byId.values()].sort((a, b) => b.endedAt - a.endedAt).slice(0, 200);
  return state;
}

module.exports = { GAME_URL, MAX_PROFILES, UUID, THEMES, PROFILE_COLORS, LAYOUTS, FOCUS_LAYOUTS, text, number, color, zoom, partitionFor, initialState, restoreState, sanitizeStats, isGameURL, allowedNavigation, cleanBounds, cleanTrial, exportPreferences, importPreferences, liveURL, sanitizeMarket, sanitizeLives };
