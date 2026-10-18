'use strict';

// Read-only statistics and explicit UI-navigation adapter. Selectors checked against the public official client:
// https://pokeidle.io/app and https://pokeidle.io/app.js?v=1.305.9 (2026-10-18).
// The game renders these values in pintarTreinador(), pintarAtivo(), pintarTime().
// No passwords, cookies, storage, page JavaScript, network interception or trade commands.
// Explicit tools only click a closed allowlist of official navigation/filter controls.
(() => {
  const { ipcRenderer } = require('electron');
  if (typeof process !== 'undefined' && process.isMainFrame === false) return;

  const CHANNEL = 'game:stats';
  const POLL_MS = 2_000;
  const HEARTBEAT_MS = 30_000;
  let previousSignature = '';
  let lastSent = 0;

  const isGamePage = () => location.origin === 'https://pokeidle.io'
    && (location.pathname === '/app' || location.pathname === '/app/');

  function cleanText(value, max = 96) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function find(selector, root = document) {
    return root?.querySelector(selector) ?? null;
  }

  function text(selector, root = document, max = 96) {
    return cleanText(find(selector, root)?.textContent, max);
  }

  function shown(element) {
    return !!element && !element.hidden && !element.classList.contains('hidden')
      && element.getAttribute('aria-hidden') !== 'true';
  }

  // Official client always formats counters with toLocaleString('pt-BR'),
  // independently of the selected UI language. Missing/unsafe numbers stay null.
  function counterNumber(value) {
    const raw = String(value ?? '').trim().replace(/[\s\u00a0\u202f]/g, '');
    if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(raw)) return null;
    const result = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(result) && result >= 0 && result <= Number.MAX_SAFE_INTEGER
      ? result : null;
  }

  function rawNumber(value) {
    const raw = String(value ?? '').trim();
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const result = Number(raw);
    return Number.isFinite(result) && result <= Number.MAX_SAFE_INTEGER ? result : null;
  }

  function levelNumber(value) {
    const match = cleanText(value).match(/^(?:(?:Nv|Lv|Lvl)\.?\s*)?(\d+)$/i);
    if (!match) return null;
    const result = Number(match[1]);
    return Number.isSafeInteger(result) && result >= 1 ? result : null;
  }

  function progress(value, parse = counterNumber) {
    const parts = cleanText(value).replace(/\s*xp\s*$/i, '').split('/');
    if (parts.length !== 2) return null;
    const current = parse(parts[0]);
    const target = parse(parts[1]);
    if (current === null || target === null || target <= 0 || current > target) return null;
    return { current, target, percent: Math.max(0, Math.min(100, current / target * 100)) };
  }

  function emptySnapshot(status = 'login') {
    return {
      schemaVersion: 1,
      at: Date.now(),
      loggedIn: false,
      nick: null,
      trainerLevel: null,
      gold: null,
      diamonds: null,
      gems: null,
      trainerXp: null,
      pokemon: null,
      hunt: null,
      economy: null,
      status,
    };
  }

  function activePokemon() {
    const card = find('#ativo-card');
    if (!card || card.classList.contains('vazio')) return null;
    const nameElement = find('.ativo-nome', card);
    // The official name is a direct text node. Level, refinement badges and the
    // rank crown are child elements and must not become part of the name.
    const name = cleanText(Array.from(nameElement?.childNodes ?? [])
      .filter(node => node.nodeType === 3).map(node => node.textContent).join(' '), 64);
    const level = levelNumber(text('.pl-lv', card));
    if (!name || level === null) return null;
    const hp = progress(text('.barra.hp > span', card), rawNumber);
    const xp = progress(text('.barra.xp > span', card));
    // data-id is an ordinary rendered team-row identifier, not an account/session token.
    const idText = cleanText(find('#time .poke-linha.ativo')?.getAttribute('data-id'), 48);
    const id = /^[A-Za-z0-9_-]{1,48}$/.test(idText) ? idText : null;
    return {
      id,
      name,
      level,
      hp: hp?.current ?? null,
      maxHp: hp?.target ?? null,
      xpCurrent: xp?.current ?? null,
      xpTarget: xp?.target ?? null,
    };
  }

  function readSnapshot() {
    const base = emptySnapshot();
    const app = find('#app');
    const portal = find('#portal');
    const nick = text('#tr-nick', document, 32);
    if (!shown(app) || shown(portal) || !nick || /^[—–-]+$/.test(nick)) return base;

    const pokemon = activePokemon();
    let status = pokemon?.hp === 0 ? 'fainted' : 'game_visible';
    if (shown(find('#sessao-tomada'))) status = 'session_elsewhere';
    else if (shown(find('#alerta-conta'))) status = 'account_alert';
    else if (navigator.onLine === false) status = 'offline';
    else if (/^(?:reconectando|reconnecting|reconectando)/i.test(text('#hud-log > div:first-child'))) {
      status = 'reconnecting';
    }

    return {
      ...base,
      loggedIn: true,
      nick,
      trainerLevel: levelNumber(text('#tr-level')),
      gold: counterNumber(text('#tr-gold')),
      diamonds: counterNumber(text('#tr-diamantes')),
      gems: counterNumber(text('#tr-gemas')),
      trainerXp: progress(text('#tr-xp-txt')),
      pokemon,
      hunt: text('#hud-hunt', document, 120) || text('#eco-onde', document, 120) || null,
      economy: document.documentElement?.classList.contains('modo-economia') ?? null,
      status,
    };
  }

  // ---------------------------------------------------------------- tools
  // Market sources: linhaVitrineItem(), painelItemMercado(), htmlMediaDeVenda().
  // Reference is the game's unit-weighted mean of SALES in 7 days, never a median.
  // Lives sources: linhaTwitch/Kick() and montarTwitch/Kick(). No linking buttons.
  const TOOLS = new Set(['scan-stones', 'cancel-scan', 'view-stone', 'lives', 'items', 'sales', 'team', 'economy']);
  const MAX_STONES = 32;
  const REQUEST_GAP_MS = 750;
  let operationId = 0;
  let operation = null;
  let scanState = null;
  let scanNick = null;

  function all(selector, root = document) {
    return Array.from(root?.querySelectorAll(selector) ?? []);
  }

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function sendTool(channel, value) {
    if (isGamePage()) ipcRenderer.send(channel, { at: Date.now(), ...value });
  }

  function toolResult(tool, ok, error = null) {
    sendTool('game:tool-result', { tool, ok, ...(error ? { error } : {}) });
  }

  function cancelOperation(error = 'Consulta cancelada.') {
    operationId += 1;
    operation = null;
    if (scanState?.scanning) {
      scanState = { ...scanState, scanning: false, error };
      sendTool('game:market', scanState);
    }
  }

  function checkOperation(op) {
    if (op.id !== operationId || operation !== op) throw new Error('Consulta cancelada.');
    const snapshot = readSnapshot();
    if (!isGamePage() || !snapshot.loggedIn || snapshot.nick !== op.nick
      || !['game_visible', 'fainted'].includes(snapshot.status)) {
      throw new Error('A consulta parou porque a conta saiu do jogo ou perdeu a conexão.');
    }
    if (Date.now() - op.startedAt > 90_000) throw new Error('A consulta atingiu o limite de tempo. Tente novamente.');
  }

  function click(element, op) {
    if (op) checkOperation(op);
    if (!element || element.disabled || typeof element.click !== 'function') {
      throw new Error('O controle esperado não está disponível nesta tela do jogo.');
    }
    element.click();
  }

  async function waitFor(read, op, timeoutMs = 5_000) {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      checkOperation(op);
      const value = read();
      if (value) return value;
      await pause(100);
    }
    throw new Error('O jogo não terminou de carregar esta consulta.');
  }

  function money(element) {
    if (!element) return null;
    const value = counterNumber(element.getAttribute('title') || element.textContent);
    return value === null ? null : {
      value,
      currency: element.classList.contains('orb') ? 'orb' : 'gold',
    };
  }

  function rowItemId(row) {
    const id = cleanText(row?.getAttribute('data-item'), 16);
    return /^\d{1,12}$/.test(id) ? id : null;
  }

  function stoneRow(itemId) {
    return all('#cm-lista .cmi-linha').find(row => rowItemId(row) === itemId) ?? null;
  }

  function catalogue() {
    return all('#cm-lista .cmi-linha').map(row => {
      const itemId = rowItemId(row);
      const name = text('.cmi-nome > b', row, 96);
      const price = all('.cmi-precos .cm-preco', row).map(money)
        .find(entry => entry?.currency === 'gold');
      return itemId && name ? {
        itemId,
        name,
        currency: 'gold',
        minUnitPrice: price?.value ?? null,
        average7d: null,
        belowPercent: null,
      } : null;
    }).filter(Boolean);
  }

  async function openCommunity(op) {
    click(find('.menu-topo button[data-modal="community"]'), op);
    await waitFor(() => find('#cm-busca'), op);
  }

  async function prepareStones(op) {
    await openCommunity(op);
    await pause(REQUEST_GAP_MS);
    const search = find('#cm-busca');
    if (search?.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await pause(REQUEST_GAP_MS);
    }
    const items = await waitFor(() => find('.cm-filtro[data-tipo="item"]'), op);
    click(items, op);
    await pause(REQUEST_GAP_MS);
    await waitFor(() => find('.cm-filtro[data-cat="stone"]'), op);
    const clearFilters = find('#cm-limpar');
    if (clearFilters) {
      // limparFiltrosDoMercado() preserves the current item tab and search.
      click(clearFilters, op);
      await pause(REQUEST_GAP_MS);
    }
    click(await waitFor(() => find('.cm-filtro[data-cat="stone"]'), op), op);
    await pause(REQUEST_GAP_MS);
    await waitFor(() => find('#cm-lista'), op);
  }

  function selectedMatches(itemId) {
    const active = all('#cm-lista .cmi-linha').find(row => row.classList.contains('on'));
    return rowItemId(active) === itemId;
  }

  function loadedText(value) {
    return !!value && !/^(?:carregando|loading|cargando)(?:\b|[.…])|^[.…\s]+$/i.test(value);
  }

  function selectedListings() {
    return all('#cm-lista .cmi-painel .cmv-linha').slice(0, 100).map(row => {
      const price = money(find('.cmv-preco .cm-preco', row));
      const quantityText = text('.cmv-qtd', row).match(/^([\d.,\s]+)\s*[×x]/i)?.[1];
      const quantity = counterNumber(quantityText);
      // Only read the rendered listing ID. This button is NEVER clicked.
      const idText = cleanText(find('.cmv-comprar', row)?.getAttribute('data-anuncio'), 24);
      const id = /^\d{1,20}$/.test(idText) ? idText : null;
      if (!id || !price || quantity === null) return null;
      const totalPrice = price.value * quantity;
      return {
        id, quantity, currency: price.currency, unitPrice: price.value,
        totalPrice: Number.isFinite(totalPrice) && totalPrice <= Number.MAX_SAFE_INTEGER ? totalPrice : null,
      };
    }).filter(Boolean);
  }

  async function selectStone(itemId, op) {
    click(stoneRow(itemId), op);
    await pause(REQUEST_GAP_MS);
    await waitFor(() => selectedMatches(itemId) && find('#cm-lista .cmi-painel .cmp-switch'), op, 3_500);
    if (find('#cm-lista .cmi-painel .cmp-switch')?.getAttribute('data-moeda') !== 'gold') {
      click(find('#cm-lista .cmi-painel [data-swmoeda="gold"]'), op);
      await pause(REQUEST_GAP_MS);
    }
    // htmlMediaDeVenda(undefined) is empty while the summary is loading. Also
    // reject generic loading placeholders if a later client version adds them.
    // A "no sales" message is a valid missing reference; numeric zero is valid.
    await waitFor(() => {
      if (!selectedMatches(itemId)) return false;
      const reference = text('#cm-lista .cmi-painel .cmp-media', document, 240);
      return loadedText(reference);
    }, op, 3_500);
    const entry = catalogue().find(item => item.itemId === itemId);
    if (!entry) throw new Error('A pedra selecionada saiu da lista.');
    const mean = money(find('#cm-lista .cmi-painel .cmp-media .cm-preco'));
    entry.average7d = mean?.currency === 'gold' ? mean.value : null;
    entry.belowPercent = entry.minUnitPrice !== null && entry.average7d !== null && entry.average7d > 0
      ? (entry.average7d - entry.minUnitPrice) / entry.average7d * 100 : null;
    return entry;
  }

  async function scanStones(op) {
    scanNick = op.nick;
    scanState = { available: false, scanning: true, scanned: 0, total: 0,
      currency: 'gold', catalog: [], source: 'visible-dom' };
    sendTool('game:market', scanState);
    await prepareStones(op);
    checkOperation(op);
    const entries = catalogue();
    scanState = { ...scanState, available: true, total: Math.min(entries.length, MAX_STONES),
      catalog: entries.slice(0, MAX_STONES), limited: entries.length > MAX_STONES };
    sendTool('game:market', scanState);
    let missing = 0;
    for (let index = 0; index < scanState.total; index += 1) {
      checkOperation(op);
      const itemId = scanState.catalog[index].itemId;
      try {
        const entry = await selectStone(itemId, op);
        checkOperation(op);
        scanState.catalog[index] = entry;
      } catch (error) {
        checkOperation(op); // cancellation is not an unavailable price
        missing += 1;
      }
      scanState.scanned = index + 1;
      sendTool('game:market', scanState);
    }
    checkOperation(op);
    scanState = { ...scanState, scanning: false,
      ...(missing ? { error: `A referência de ${missing} pedra(s) não carregou. Valores ausentes ficaram em branco.` } : {}) };
    sendTool('game:market', scanState);
  }

  function liveLinks(platform) {
    const twitch = platform === 'twitch';
    const selector = twitch ? '#tw-corpo a.tw-canal.ao-vivo' : '#kk-corpo a.kk-canal.ao-vivo';
    return all(selector).slice(0, 64).map(anchor => {
      try {
        const url = new URL(anchor.getAttribute('href'));
        const hosts = twitch ? ['twitch.tv', 'www.twitch.tv'] : ['kick.com', 'www.kick.com'];
        if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password
          || url.port || !/^\/[A-Za-z0-9_-]{1,80}\/?$/.test(url.pathname)) return null;
        url.search = '';
        url.hash = '';
        return {
          platform,
          label: text(twitch ? '.tw-canal-nome' : '.kk-canal-nome', anchor, 80) || url.pathname.slice(1),
          url: url.href,
        };
      } catch { return null; }
    }).filter(Boolean);
  }

  async function gatherLives(op) {
    const links = [];
    let available = false;
    let opened = null;
    for (const platform of ['twitch', 'kick']) {
      checkOperation(op);
      const button = find(`#tr-ativos .tr-ativo.${platform}`);
      if (!button) continue;
      click(button, op);
      const root = platform === 'twitch' ? '#tw-corpo' : '#kk-corpo';
      await waitFor(() => find(root), op);
      await pause(250);
      checkOperation(op);
      links.push(...liveLinks(platform));
      available = true;
      opened = root;
    }
    const unique = [...new Map(links.map(link => [link.url, link])).values()];
    sendTool('game:lives', { available, links: unique,
      ...(!available ? { error: 'A lista de lives não está disponível nesta conta/tela do jogo.' } : {}) });
    // Return to the game only if our own modal is still open.
    if (opened && find(opened) && find('#modal-fechar')) click(find('#modal-fechar'), op);
  }

  async function runTool(message) {
    const tool = message?.tool;
    if (!TOOLS.has(tool) || !isGamePage()) return;
    if (tool === 'cancel-scan') return cancelOperation();
    cancelOperation('Consulta interrompida por outro atalho.');
    const snapshot = readSnapshot();
    if (!snapshot.loggedIn || !['game_visible', 'fainted'].includes(snapshot.status)) {
      const error = 'Entre na conta no jogo e aguarde a conexão antes de usar este atalho.';
      if (tool === 'lives') sendTool('game:lives', { available: false, links: [], error });
      if (tool === 'scan-stones' || tool === 'view-stone') sendTool('game:market', {
        available: false, scanning: false, scanned: 0, total: 0, catalog: [], source: 'visible-dom', error,
      });
      return toolResult(tool, false, error);
    }
    const op = { id: operationId, nick: snapshot.nick, startedAt: Date.now(), tool };
    operation = op;
    try {
      if (tool === 'items') click(find('#btn-bolsa'), op);
      else if (tool === 'sales') {
        await openCommunity(op);
        click(await waitFor(() => find('#cm-historico'), op), op);
      } else if (tool === 'team') {
        if (shown(find('#modal')) && find('#modal-fechar')) click(find('#modal-fechar'), op);
        const mobileTeam = find('#m-nav button[data-aba="equipe"]');
        if (mobileTeam && !mobileTeam.classList.contains('on')) click(mobileTeam, op);
        const toggle = find('#btn-equipe-toggle');
        if (toggle?.getAttribute('aria-expanded') === 'false') click(toggle, op);
        const panel = find('#p-equipe');
        if (!panel) throw new Error('O painel da equipe não está disponível.');
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (tool === 'economy') {
        if (document.documentElement.classList.contains('modo-economia')) click(find('#eco-sair'), op);
        else {
          click(find('#btn-config'), op);
          click(await waitFor(() => find('#cfg-economia'), op), op);
        }
        sample(true);
      } else if (tool === 'lives') await gatherLives(op);
      else if (tool === 'scan-stones') await scanStones(op);
      else if (tool === 'view-stone') {
        const itemId = cleanText(message.itemId, 16);
        if (!/^\d{1,12}$/.test(itemId)) throw new Error('Selecione uma pedra válida na lista.');
        await prepareStones(op);
        const entry = await selectStone(itemId, op);
        // The item summary and its sellers are separate rendered responses.
        // Do not report an empty seller list while the game's panel is loading.
        await waitFor(() => selectedMatches(itemId)
          && (all('#cm-lista .cmi-painel .cmv-linha').length > 0
            || loadedText(text('#cm-lista .cmi-painel .cmp-vagao .cm-vazio'))), op, 3_500);
        // Opening one result must not replace the complete scan in the board.
        // Keep it only for the same account and a member of the prior catalog.
        const prior = scanNick === op.nick && scanState?.catalog.some(item => item.itemId === itemId)
          ? scanState : null;
        scanNick = op.nick;
        scanState = { ...(prior ?? { scanned: 1, total: 1 }),
          available: true, scanning: false, currency: 'gold',
          catalog: prior ? prior.catalog.map(item => item.itemId === itemId ? entry : item) : [entry],
          selectedItemId: itemId, listings: selectedListings(), source: 'visible-dom' };
        delete scanState.error;
        sendTool('game:market', scanState);
      }
      checkOperation(op);
      toolResult(tool, true);
    } catch (error) {
      if (op.id !== operationId) return;
      const message = cleanText(error?.message || 'Não foi possível abrir a consulta no jogo.', 200);
      if (tool === 'scan-stones') {
        scanState = { ...(scanState ?? { available: false, scanned: 0, total: 0, catalog: [], source: 'visible-dom' }),
          scanning: false, error: message };
        sendTool('game:market', scanState);
      } else if (tool === 'lives') sendTool('game:lives', { available: false, links: [], error: message });
      else if (tool === 'view-stone') sendTool('game:market', { available: false, scanning: false,
        scanned: 0, total: 0, catalog: [], source: 'visible-dom', error: message });
      toolResult(tool, false, message);
    } finally {
      if (operation === op) operation = null;
    }
  }

  function sample(force = false) {
    if (!isGamePage()) return;
    let snapshot;
    try {
      snapshot = readSnapshot();
    } catch {
      snapshot = emptySnapshot('layout_unavailable');
    }
    const { at, ...stable } = snapshot;
    const signature = JSON.stringify(stable);
    if (!force && signature === previousSignature && at - lastSent < HEARTBEAT_MS) return;
    previousSignature = signature;
    lastSent = at;
    ipcRenderer.send(CHANNEL, snapshot);
  }

  // Deliberately bounded polling: no MutationObserver on battle animation,
  // and no API exposed into the remote page's main world.
  if (!isGamePage()) return;
  ipcRenderer.on('game:tool', (_event, message) => { void runTool(message); });
  // A real interaction inside the game takes priority over an in-progress scan.
  window.addEventListener('pointerdown', event => {
    if (event.isTrusted && operation?.tool === 'scan-stones') cancelOperation('Consulta cancelada porque você interagiu com o jogo.');
  }, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sample(true), { once: true });
  } else sample(true);
  const timer = setInterval(() => sample(), POLL_MS);
  window.addEventListener('pageshow', () => sample(true));
  window.addEventListener('popstate', () => sample(true));
  window.addEventListener('online', () => sample(true));
  window.addEventListener('offline', () => sample(true));
  window.addEventListener('pagehide', () => {
    cancelOperation('Consulta encerrada pela navegação da página.');
    clearInterval(timer);
  }, { once: true });
})();
