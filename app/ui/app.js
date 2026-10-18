'use strict';

(() => {
  const bridge = window.idleBoard;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const iconPaths = {
    plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
    x:'<path d="m6 6 12 12M18 6 6 18"/>', check:'<path d="m5 12 4 4L19 6"/>',
    'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>', 'arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
    shield:'<path d="m12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
    focus:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m0-8h6"/>',
    single:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/>',
    chart:'<path d="M4 4v16h17M8 16v-4m5 4V8m5 8V5"/>',
    settings:'<path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3H9Z"/><circle cx="12" cy="11" r="3"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    sidebar:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-10-2 2 2 2"/>',
    maximize:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
    play:'<path d="m8 5 11 7-11 7V5Z"/>', stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    reload:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2"/>',
    volume:'<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted:'<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="m16 9 5 6m0-6-5 6"/>',
    home:'<path d="m3 10 9-7 9 7m-16-1v11h14V9M9 20v-7h6v7"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
    upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3V6Z"/>',
    game:'<path d="M8 7h8c4 0 6 9 4 11-2 2-4-2-5-2H9c-1 0-3 4-5 2-2-2 0-11 4-11Z"/><path d="M8 10v5m-2.5-2.5h5M16 11h.01M18 14h.01M10 7l1-3h3"/>',
    leaf:'<path d="M20 3C10 2 3 7 4 13c1 7 11 8 14 1 1-3 1-7 2-11Z"/><path d="M4 21 15 9"/>',
    sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    trainer:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3"/>',
    coin:'<circle cx="12" cy="12" r="8"/><path d="M14.5 8.5c-4-2-6 2-2.5 3.5s1.5 5-2.5 3M12 6v12"/>',
    ball:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M3 12h6m6 0h6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    sort:'<path d="M8 4v16m-3-3 3 3 3-3m5-13v16m-3-13 3-3 3 3"/>',
    calculator:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/>',
    'chevron-down':'<path d="m6 9 6 6 6-6"/>',
    bag:'<path d="M5 7h14l2 14H3L5 7ZM8 8V6a4 4 0 0 1 8 0v2"/>',
    team:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3M16 5a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v2"/>',
    exit:'<path d="M9 4H4v16h5m4-12 4 4-4 4m-5-4h13"/>',
    video:'<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-4v12l-6-4"/>',
    gem:'<path d="m3 9 4-6h10l4 6-9 12L3 9ZM3 9h18M7 3l5 18 5-18M7 3l5 6 5-6"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.info}</svg>`;
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const COLORS = [
    {value:'#b7e793',name:'Verde'}, {value:'#91d9ec',name:'Azul'}, {value:'#ccb0f2',name:'Violeta'},
    {value:'#f0bc8a',name:'Laranja'}, {value:'#eea4be',name:'Rosa'}, {value:'#e4d58e',name:'Amarelo'}
  ];
  const defaults = { version:'1.0.0', profiles:[], openIds:[], focusedId:null, layout:'grid', theme:'forest', keepAwake:false, sidebarCollapsed:false, runtime:{}, trials:[], system:{} };
  let state = {...defaults};
  let editingProfileId = null;
  let selectedColor = COLORS[0].value;
  let farmProfileId = null;
  let livesProfileId = null;
  let stonesProfileId = null;
  let trialSort = {key:'pokemonXpPerHour',direction:-1};
  let boundsFrame = 0;
  let activeDialog = null;
  let openingDialog = false;
  let panelStructure = '';
  const pending = new Set();
  const isPreview = Boolean(bridge?.isPreview);

  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach(node => {
      if (node.dataset.renderedIcon !== node.dataset.icon) {
        node.innerHTML = icon(node.dataset.icon);
        node.dataset.renderedIcon = node.dataset.icon;
      }
    });
  }
  function colors(root = document) {
    $$('[data-color]', root).forEach(node => node.style.setProperty('--profile-color', /^#[\da-f]{6}$/i.test(node.dataset.color || '') ? node.dataset.color : COLORS[0].value));
  }
  function setHTML(node, value) {
    if (node && node._renderedHTML !== value) { node.innerHTML = value; node._renderedHTML = value; }
  }
  function numeric(value, fallback = '—') { return Number.isFinite(Number(value)) && value !== null && value !== undefined && value !== '' ? number.format(Number(value)) : fallback; }
  function signed(value) { return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Number(value)>0?'+':''}${number.format(Number(value))}`; }
  function duration(ms, long = false) {
    if (!Number.isFinite(Number(ms)) || ms < 0) return '—';
    const seconds = Math.floor(ms/1000), hours = Math.floor(seconds/3600), minutes = Math.floor(seconds%3600/60), rest = seconds%60;
    if (long) return hours ? `${hours}h ${String(minutes).padStart(2,'0')}min` : `${minutes}min ${String(rest).padStart(2,'0')}s`;
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}` : `${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`;
  }
  function label(value, fallback = 'Não informado') {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return String(value.name || value.label || value.title || value.id || fallback);
    return String(value);
  }
  function profile(id) { return state.profiles.find(p => p.id === id); }
  function runtime(id) { return state.runtime?.[id] || {}; }
  function visibleOpenIds() {
    const ids = state.openIds.filter(id => profile(id));
    if (state.layout === 'single') return ids.includes(state.focusedId) ? [state.focusedId] : ids.slice(0,1);
    if (state.layout === 'focus' && ids.includes(state.focusedId)) return [state.focusedId, ...ids.filter(id => id !== state.focusedId)];
    return ids;
  }
  function currentElapsed(farm) {
    if (!farm) return null;
    return Number.isFinite(farm.elapsedMs) ? farm.elapsedMs : null;
  }
  function toast(message, error = false) {
    if (!message) return;
    const region = $('#toast-region');
    const node = document.createElement('div');
    node.className = `toast${error ? ' error' : ''}`;
    node.innerHTML = `${icon(error?'info':'check')}<span>${esc(message)}</span><button aria-label="Dispensar mensagem">${icon('x')}</button>`;
    node.querySelector('button').addEventListener('click', () => node.remove());
    region.append(node);
    while (region.childElementCount > 1) region.firstElementChild.remove();
    setTimeout(() => node.remove(), error ? 7500 : 4500);
  }
  async function call(action, payload = {}, options = {}) {
    const key = `${action}:${payload.id || ''}`;
    if (pending.has(key)) return {ok:false,busy:true};
    pending.add(key);
    try {
      const result = await bridge.act(action,payload);
      if (result?.state) acceptState(result.state);
      if (result?.ok === false) {
        if (!result.canceled && result.error) toast(result.error,true);
      } else if (result?.message || options.success) toast(result?.message || options.success);
      return result || {ok:true};
    } catch (error) {
      const message = error?.message || 'Não foi possível concluir a ação. Tente novamente.';
      toast(message,true);
      return {ok:false,error:message};
    } finally { pending.delete(key); }
  }
  function acceptState(next) {
    state = {...defaults,...next,profiles:Array.isArray(next?.profiles)?next.profiles:[],openIds:Array.isArray(next?.openIds)?next.openIds:[],trials:Array.isArray(next?.trials)?next.trials:[],runtime:next?.runtime||{}};
    render();
  }
  function render() {
    document.documentElement.dataset.theme = ['forest','ocean','violet'].includes(state.theme) ? state.theme : 'forest';
    $('#app-shell').classList.toggle('has-panels',state.openIds.length>0);
    $('#preview-banner').hidden = !isPreview;
    $('#profile-count').textContent = `${state.profiles.length} / 4`;
    $('#open-count').textContent = String(state.openIds.length);
    $('#header-add').disabled = state.profiles.length>=4;
    $('#sidebar-add').disabled = state.profiles.length>=4;
    $('#header-add').title = state.profiles.length>=4 ? 'Você já tem quatro perfis. Edite ou exclua um para criar outro.' : 'Criar um perfil local';
    $('#sidebar-add').title = state.profiles.length>=4 ? 'Limite de quatro perfis' : 'Adicionar perfil';
    $('#open-all-button').disabled = !state.profiles.length || state.profiles.every(p=>state.openIds.includes(p.id));
    $('#farm-active-dot').hidden = !Object.values(state.runtime).some(r=>r.farm?.running);
    $('#about-version').textContent = isPreview ? 'Prévia da interface' : `Versão ${state.version || '1.0.0'}`;
    $$('[data-action="layout"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===state.layout)));
    $$('[data-action="theme"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeValue===state.theme)));
    $('#keep-awake-toggle').setAttribute('aria-checked',String(Boolean(state.keepAwake)));
    renderProfiles();
    renderPanels();
    if ($('#farm-dialog').open) renderFarm();
    if ($('#lives-dialog')?.open) renderLives();
    if ($('#stones-dialog')?.open) renderStones();
    hydrateIcons();
    colors();
    scheduleBounds();
  }
  function renderProfiles() {
    const html = state.profiles.length ? state.profiles.map(p=>{
      const open = state.openIds.includes(p.id), r = runtime(p.id), status = isPreview && open ? 'Prévia do painel' : !open ? 'Fechado' : r.status==='error' ? 'Falha na conexão' : r.status==='loading' ? 'Carregando…' : r.stats?.loggedIn ? 'Em jogo' : 'Aguardando login';
      return `<div class="profile-item ${state.focusedId===p.id&&open?'selected':''}" title="${esc(p.name)}${open?' — clique para selecionar':' — clique para abrir'}"><button class="profile-main" data-action="profile-select" data-id="${esc(p.id)}" aria-label="${open?'Selecionar':'Abrir'} ${esc(p.name)}"><div class="profile-avatar" data-color="${esc(p.color)}">${esc(p.name.trim().slice(0,1).toLocaleUpperCase('pt-BR')||'P')}</div><div class="profile-text"><strong>${esc(p.name)}</strong><span class="profile-subtitle"><i class="status-dot ${open?(r.status==='loading'?'loading':r.status==='error'?'error':'ready'):''}"></i>${esc(status)}</span></div></button><button class="profile-menu" data-action="profile-edit" data-id="${esc(p.id)}" title="Editar ${esc(p.name)}" aria-label="Editar ${esc(p.name)}">${icon('more')}</button>${open?`<span class="profile-hotkey">${state.openIds.indexOf(p.id)+1}</span>`:''}</div>`;
    }).join('') : '<div class="sidebar-empty">Os seus perfis aparecerão aqui.<br>Cada conta tem o seu espaço.</div>';
    setHTML($('#profile-list'),html);
  }
  function emptyHTML() {
    const hasProfiles = state.profiles.length>0;
    return `<div class="empty-workspace"><div class="empty-content">${icon('game')}<h2>${hasProfiles?'Tudo pronto para continuar.':'Seu PokeIdle, em um só lugar.'}</h2><p>${hasProfiles?'Abra os seus perfis e retome o jogo.':'Até quatro contas, com sessões separadas.<br>O login acontece diretamente no jogo.'}</p><button class="button button-primary" data-action="${hasProfiles?'open-all':'profile-create'}">${icon(hasProfiles?'play':'plus')}${hasProfiles?'Abrir minhas contas':'Criar primeira conta'}</button><button class="text-button" data-action="help-open">Como usar ${icon('arrow-up-right')}</button></div></div>`;
  }
  function renderPanels() {
    const ids = visibleOpenIds(), workspace = $('#game-workspace');
    const signature = `${state.layout}|${ids.join(',')}|${state.profiles.length>0}`;
    if (!ids.length) {
      if (panelStructure!==signature) { setHTML(workspace,emptyHTML()); panelStructure=signature; }
      return;
    }
    let grid = $('.panel-grid',workspace);
    if (!grid) {
      workspace.innerHTML = '<div class="panel-grid"></div>';
      workspace._renderedHTML=null;
      grid = $('.panel-grid',workspace);
    }
    grid.dataset.layout=state.layout;
    grid.dataset.count=String(ids.length);
    $$('.game-panel',grid).forEach(node=>{if(!ids.includes(node.dataset.profileId)){resizeObserver.unobserve($('.game-slot',node));node.remove();}});
    ids.forEach((id,index)=>{
      const p=profile(id), r=runtime(id);
      let node = $$('.game-panel',grid).find(el=>el.dataset.profileId===id);
      if (!node) {
        node=document.createElement('article');
        node.className='game-panel'; node.dataset.profileId=id;
        node.innerHTML='<div class="panel-bar"><div class="panel-heading"></div><div class="panel-tools"></div></div><div class="slot-frame"><div class="game-slot"></div></div><div class="panel-footer" hidden></div>';
        $('.game-slot',node).dataset.id=id;
        grid.append(node);
        resizeObserver.observe($('.game-slot',node));
      }
      if(grid.children[index]!==node) grid.insertBefore(node,grid.children[index]||null);
      node.classList.toggle('is-focused',state.focusedId===id);
      node.setAttribute('aria-label',`Painel ${p.name}`);
      const status=isPreview?'Prévia da interface':r.status==='error'?'Falha na conexão':r.status==='loading'?'Carregando…':r.stats?.loggedIn?`${label(r.stats.nick,p.name)}${r.stats.trainerLevel!=null?` · Nível ${numeric(r.stats.trainerLevel)}`:''}`:'Aguardando login';
      setHTML($('.panel-heading',node),`<button class="panel-profile" data-action="panel-focus" data-id="${esc(id)}" title="${esc(r.notice||`Selecionar ${p.name}`)}"><span class="panel-color-dot" data-color="${esc(p.color)}"></span><span class="panel-title"><strong>${esc(p.name)}</strong></span>${r.notice?`<span class="panel-notice" title="${esc(r.notice)}">${icon('info')}</span>`:''}<span class="panel-connection ${r.status==='error'?'error':''}" title="${esc(r.errorMessage||status)}">${esc(status)}</span></button><button class="icon-button panel-profile-settings" data-action="profile-edit" data-id="${esc(id)}" title="Editar perfil" aria-label="Editar ${esc(p.name)}">${icon('more')}</button>`);
      const zoom=Math.round((p.zoom||.6)*100), economy=r.stats?.economy ?? null;
      const tool=(name,title,i)=>`<button class="game-tool" data-action="game-tool" data-tool="${name}" data-id="${esc(id)}" title="${title}" aria-label="${title}">${icon(i)}<span class="tool-label">${title}</span></button>`;
      setHTML($('.panel-tools',node),`<div class="game-tool-group">${tool('items','Itens','bag')}${tool('sales','Vendas','coin')}${tool('team','Time','team')}<button class="game-tool economy-tool ${economy?'active':''}" data-action="game-tool" data-tool="economy" data-id="${esc(id)}" title="Alternar modo econômico do jogo">${icon('leaf')}<span>Eco${economy===null?'':economy?' ON':' OFF'}</span></button></div><div class="panel-controls"><span class="zoom-controls"><button class="icon-button" data-action="zoom-minus" data-id="${esc(id)}" title="Diminuir zoom" aria-label="Diminuir zoom de ${esc(p.name)}" ${zoom<=35?'disabled':''}>${icon('minus')}</button><button class="icon-button zoom-label" data-action="zoom-reset" data-id="${esc(id)}" title="Zoom ${zoom}% — clique para restaurar 60%">${zoom}%</button><button class="icon-button" data-action="zoom-plus" data-id="${esc(id)}" title="Aumentar zoom" aria-label="Aumentar zoom de ${esc(p.name)}" ${zoom>=150?'disabled':''}>${icon('plus')}</button><span class="control-separator"></span></span><button class="icon-button ${p.muted?'is-muted':''}" data-action="panel-mute" data-id="${esc(id)}" title="${p.muted?'Ativar':'Silenciar'} som" aria-label="${p.muted?'Ativar':'Silenciar'} som de ${esc(p.name)}">${icon(p.muted?'muted':'volume')}</button><button class="icon-button" data-action="panel-expand" data-id="${esc(id)}" title="Ampliar este painel" aria-label="Ampliar ${esc(p.name)}">${icon('maximize')}</button><button class="icon-button" data-action="panel-reload" data-id="${esc(id)}" title="Recarregar o jogo" aria-label="Recarregar ${esc(p.name)}">${icon('reload')}</button><button class="game-tool close-panel" data-action="panel-close" data-id="${esc(id)}" title="Fechar painel: encerra a conexão desta janela e mantém o login salvo neste computador" aria-label="Fechar ${esc(p.name)}">${icon('exit')}<span class="tool-label">Sair</span></button></div>`);
      const placeholder = isPreview ? `${icon('game')}<strong>O seu jogo entra aqui.</strong><p>Este é um perfil da prévia. No aplicativo Windows, o PokeIdle abre diretamente nesta área.</p><span class="direct-url">pokeidle.io/app</span>` : r.status==='error' ? `${icon('info')}<strong>Não foi possível abrir o jogo.</strong><p>${esc(r.errorMessage||'Verifique a sua conexão e recarregue o painel.')}</p>` : `<span class="spinner"></span><strong>Abrindo o PokeIdle…</strong><p>Conexão direta com o jogo, usando a sessão deste perfil.</p>`;
      const slot=$('.game-slot',node);
      setHTML(slot,`<div class="game-placeholder">${placeholder}</div>`);
      const stats=r.stats, farm=r.farm;
      let footer='';
      if(stats?.loggedIn) {
        footer=`<span class="panel-footer-item">${icon('ball')}<strong>${esc(stats.pokemon?.name||'Pokémon não informado')}${stats.pokemon?.level!=null?` · Nv. ${numeric(stats.pokemon.level)}`:''}</strong></span><span class="panel-footer-item optional-stat">${icon('coin')}<strong>${numeric(stats.gold)}</strong></span>`;
      } else footer=`<span class="connection-label"><i class="status-dot ${isPreview?'':r.status==='error'?'error':r.status==='loading'?'loading':'ready'}"></i>${isPreview?'Prévia · nenhum jogo conectado':'Login direto no jogo'}</span>`;
      if(farm?.running) footer+=`<button class="panel-running" data-action="farm-open" data-id="${esc(id)}" title="Ver medição em andamento"><i></i>Medindo ${duration(currentElapsed(farm))}</button>`;
      else footer+=`<span class="panel-footer-spacer"></span><span class="connection-label">${isPreview?'LOCAL':'pokeidle.io'}</span>`;
      setHTML($('.panel-footer',node),footer);
    });
    panelStructure=signature;
  }
  function scheduleBounds() {
    if(boundsFrame)return;
    boundsFrame=requestAnimationFrame(()=>{
      boundsFrame=0;
      const bounds={};
      $$('.game-slot').forEach(slot=>{
        const rect=slot.getBoundingClientRect();
        if(rect.width>0&&rect.height>0)bounds[slot.dataset.id]={x:Math.round(rect.x),y:Math.round(rect.y),width:Math.floor(rect.width),height:Math.floor(rect.height)};
      });
      try { bridge.setBounds(bounds); } catch { /* Resizing can race application shutdown. */ }
    });
  }
  const resizeObserver=new ResizeObserver(scheduleBounds);
  resizeObserver.observe($('#game-workspace'));
  window.addEventListener('resize',scheduleBounds);

  async function openDialog(id, before) {
    const dialog=$(`#${id}`);
    if(!dialog||dialog.open||openingDialog)return;
    openingDialog=true;
    try {
      if(activeDialog?.open) { activeDialog.close(); await Promise.resolve(); }
      await bridge.setOverlay(true);
      if(before)before();
      activeDialog=dialog;
      dialog.append($('#toast-region'));
      dialog.showModal();
      hydrateIcons(dialog);
      if(id==='profile-dialog')setTimeout(()=>$('#profile-name').focus(),0);
      if(id==='farm-dialog')renderFarm();
      if(id==='lives-dialog')renderLives();
      if(id==='stones-dialog')renderStones();
    } catch(error) {
      toast(error?.message||'Não foi possível abrir esta janela.',true);
      if(!activeDialog?.open)await bridge.setOverlay(false);
    } finally { openingDialog=false; }
  }
  function closeDialog(dialog=activeDialog) { if(dialog?.open)dialog.close(); }
  $$('dialog').forEach(dialog=>{
    dialog.addEventListener('close',async()=>{
      if(activeDialog===dialog)activeDialog=null;
      if(!openingDialog&&!$$('dialog').some(d=>d.open)) {
        document.body.append($('#toast-region'));
        await bridge.setOverlay(false);
        scheduleBounds();
      }
    });
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const r=dialog.getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog(dialog);
    });
  });
  function renderColorOptions() {
    setHTML($('#profile-colors'),COLORS.map(c=>`<button type="button" class="color-swatch" role="radio" aria-label="${c.name}" aria-checked="${c.value===selectedColor}" data-action="profile-color" data-value="${c.value}"><span>${c.value===selectedColor?icon('check'):''}</span></button>`).join(''));
    $$('.color-swatch').forEach(node=>node.style.setProperty('--swatch-color',node.dataset.value));
    renderProfilePreview();
  }
  function renderProfilePreview() {
    const name=$('#profile-name').value.trim()||'Seu perfil';
    $('#profile-preview-name').textContent=name;
    $('#profile-preview-avatar').textContent=name.slice(0,1).toLocaleUpperCase('pt-BR');
    $('#profile-preview-avatar').style.setProperty('--profile-color',selectedColor);
  }
  async function openProfile(id=null) {
    const p=id?profile(id):null;
    if(!p&&state.profiles.length>=4){toast('Você já tem quatro perfis. Edite ou exclua um para criar outro.');return;}
    await openDialog('profile-dialog',()=>{
      editingProfileId=p?.id||null;
      selectedColor=p?.color||COLORS.find(c=>!state.profiles.some(pr=>pr.color===c.value))?.value||COLORS[0].value;
      $('#profile-name').value=p?.name||'';
      $('#profile-dialog-title').textContent=p?'Editar perfil':'Novo perfil';
      $('#profile-save-button').innerHTML=p?`Salvar alterações ${icon('check')}`:`Criar e abrir ${icon('arrow-right')}`;
      $('#profile-delete-button').hidden=!p;
      $('#profile-error').hidden=true;
      renderColorOptions();
    });
  }
  $('#profile-name').addEventListener('input',renderProfilePreview);
  $('#profile-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const name=$('#profile-name').value.trim();
    if(!name){$('#profile-error').textContent='Escolha um nome para identificar este perfil.';$('#profile-error').hidden=false;$('#profile-name').focus();return;}
    const button=$('#profile-save-button');button.disabled=true;
    const result=await call(editingProfileId?'profile:update':'profile:add',{...(editingProfileId?{id:editingProfileId}:{}),name,color:selectedColor});
    button.disabled=false;
    if(result?.ok!==false)closeDialog();
    else if(result?.error){$('#profile-error').textContent=result.error;$('#profile-error').hidden=false;}
  });
  function renderFarm() {
    const selector=$('#farm-profile');
    if(!state.profiles.some(p=>p.id===farmProfileId))farmProfileId=state.focusedId||state.profiles[0]?.id||null;
    const options=state.profiles.length?state.profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${state.openIds.includes(p.id)?'':' · fechado'}</option>`).join(''):'<option value="">Nenhum perfil criado</option>';
    setHTML(selector,options); selector.value=farmProfileId||'';selector.disabled=!state.profiles.length;
    const r=runtime(farmProfileId),stats=r.stats,farm=r.farm,canStart=!isPreview&&Boolean(stats?.loggedIn)&&state.openIds.includes(farmProfileId)&&!farm?.running;
    setHTML($('#farm-live-context'),stats?.loggedIn?`<strong>${esc(label(stats.pokemon?.name,'Pokémon não informado'))}${stats.pokemon?.level!=null?` · Nível ${numeric(stats.pokemon.level)}`:''}</strong><span>Hunt: ${esc(label(stats.hunt,'não informada pelo jogo'))}</span>`:`<strong>${isPreview?'Medição disponível no aplicativo Windows':!farmProfileId?'Crie um perfil para começar':'Entre no jogo para medir'}</strong><span>${isPreview?'Nenhum dado de conta é simulado nesta prévia.':'As métricas aparecem após a leitura da sessão do jogo.'}</span>`);
    setHTML($('#farm-control-buttons'),farm?.running?`<button class="button button-subtle" data-action="farm-stop" data-id="${esc(farmProfileId)}">${icon('stop')}Encerrar medição</button>`:`<button class="button button-primary" data-action="farm-start" data-id="${esc(farmProfileId||'')}" ${canStart?'':'disabled'}>${icon('play')}Iniciar medição</button>`);
    const notice=farm?.notice|| (farm?.running?'A taxa por hora aparece após 60 segundos de leituras. Mantenha a mesma hunt e o mesmo Pokémon.':'Escolha a hunt e o Pokémon antes de iniciar. Trocas de hunt, Pokémon ou conta encerram a medição.');
    $('#farm-notice').classList.toggle('warning',Boolean(farm?.notice));
    setHTML($('#farm-notice'),`${icon(farm?.running?'clock':'info')}<span>${esc(notice)}</span>`);
    const rateAvailable=farm&&Number(farm.elapsedMs)>=60000&&farm.valid!==false;
    const metrics=[
      ['ball','XP Pokémon / hora',rateAvailable?numeric(farm.pokemonXpPerHour):'—',farm?`${numeric(farm.pokemonXp)} XP acumulado`:'Aguardando medição'],
      ['trainer','XP treinador / hora',rateAvailable?numeric(farm.trainerXpPerHour):'—',farm?`${numeric(farm.trainerXp)} XP acumulado`:'Aguardando medição'],
      ['coin','Variação de ouro',farm?signed(farm.goldDelta):'—','Inclui ganhos e gastos observados'],
      ['clock','Tempo observado',farm?duration(currentElapsed(farm)):'—',farm?.running?'Medição em andamento':farm?'Medição encerrada':'Sem medição ativa']
    ];
    setHTML($('#farm-metrics'),metrics.map(([i,title,value,detail])=>`<div class="metric-card"><span class="metric-label">${icon(i)}${title}</span><strong>${esc(value)}</strong><span class="metric-detail">${esc(detail)}</span></div>`).join(''));
    $('#trial-count').textContent=String(state.trials.length);
    const trials=[...state.trials].sort((a,b)=>{
      const av=Number(a[trialSort.key]),bv=Number(b[trialSort.key]);
      if(!Number.isFinite(av))return 1;if(!Number.isFinite(bv))return -1;
      return(av-bv)*trialSort.direction;
    });
    setHTML($('#trial-rows'),trials.map(t=>`<tr><td><strong title="${esc(t.profileName)}">${esc(t.profileName||'Perfil')}</strong><span class="subcell" title="${esc(label(t.hunt))}">${esc(label(t.hunt))}</span></td><td><strong>${esc(t.pokemonName||'Não informado')}</strong><span class="subcell">${t.endedAt?esc(new Date(t.endedAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})):''}</span></td><td>${duration(t.elapsedMs,true)}</td><td class="numeric">${numeric(t.pokemonXpPerHour)}</td><td class="numeric">${numeric(t.trainerXpPerHour)}</td><td class="numeric">${signed(t.goldDelta)}</td><td class="table-actions"><button class="icon-button" data-action="trial-delete" data-id="${esc(t.id)}" title="Excluir esta medição" aria-label="Excluir medição de ${esc(t.profileName||'perfil')}">${icon('trash')}</button></td></tr>`).join(''));
    $('#trial-empty').hidden=trials.length>0;
    $$('[data-action="sort-trials"]').forEach(button=>{
      const th=button.closest('th');
      if(button.dataset.sort===trialSort.key)th.setAttribute('aria-sort',trialSort.direction===-1?'descending':'ascending');
      else th.removeAttribute('aria-sort');
    });
  }
  $('#farm-profile').addEventListener('change',event=>{farmProfileId=event.target.value;renderFarm();});
  function calculateGoal() {
    const xp=Number($('#calculator-xp').value),rate=Number($('#calculator-rate').value),hasValues=$('#calculator-xp').value!==''&&$('#calculator-rate').value!=='';
    const output=$('#calculator-result');
    if(!hasValues||!Number.isFinite(xp)||xp<0||!Number.isFinite(rate)||rate<=0){output.textContent='—';return;}
    const hours=xp/rate;
    output.textContent=hours===0?'Meta concluída':hours<1?`${decimal.format(hours*60)} min`:hours<24?`${decimal.format(hours)} horas`:`${decimal.format(hours/24)} dias`;
  }
  $('#calculator-xp').addEventListener('input',calculateGoal);
  $('#calculator-rate').addEventListener('input',calculateGoal);

  function renderLives() {
    const root=$('#lives-content');if(!root)return;
    const openProfiles=state.profiles.filter(p=>state.openIds.includes(p.id));
    if(!openProfiles.some(p=>p.id===livesProfileId))livesProfileId=openProfiles.find(p=>p.id===state.focusedId)?.id||openProfiles[0]?.id||null;
    fillToolProfiles($('#lives-profile'),openProfiles,livesProfileId);
    const data=state.tools?.lives,matching=data?.profileId===livesProfileId,liveData=matching?data:null;
    const loading=Boolean(data?.loading),loggedIn=Boolean(runtime(livesProfileId).stats?.loggedIn);
    $('#lives-refresh').disabled=isPreview||loading||!livesProfileId||!loggedIn;
    const stamp=liveData?.at?timeLabel(liveData.at):null;
    const error=loading?null:liveData?.error;
    const status=loading?`Consultando lives no jogo…${matching?'':` · ${profile(data.profileId)?.name||'outra conta'}`}`:error||(!loggedIn?'Abra uma conta e entre no PokeIdle para consultar.':stamp?`Última consulta: ${stamp}`:'Selecione uma conta e carregue a lista oficial do jogo.');
    $('#lives-status').classList.toggle('warning',Boolean(error));
    setHTML($('#lives-status'),`${loading?'<span class="spinner"></span>':icon(error?'info':'clock')}<span>${esc(status)}</span>`);
    const links=Array.isArray(liveData?.links)?liveData.links:[];
    if(links.length){
      setHTML(root,`<div class="live-list">${links.map(link=>`<div class="live-row"><span class="platform-mark ${link.platform==='twitch'?'twitch':'kick'}">${link.platform==='twitch'?'Twitch':'Kick'}</span><div class="live-label"><strong>${esc(link.label||'Canal')}</strong><span>${esc(link.url)}</span></div><button class="button button-subtle" data-action="live-open" data-url="${esc(link.url)}">Abrir no navegador ${icon('external')}</button></div>`).join('')}</div>`);
    }else setHTML(root,`<div class="tool-empty">${icon('video')}<strong>${loading?'Consultando lives…':liveData?.available?'Nenhuma live encontrada':'Lives no seu navegador'}</strong><p>${isPreview?'As lives são consultadas no aplicativo Windows, a partir do jogo. Esta prévia não contém canais simulados.':loading?'Lendo os canais disponibilizados pelo PokeIdle. Aguarde a conclusão da consulta.':liveData?.available?'A lista consultada no jogo não trouxe canais disponíveis agora. Você pode atualizar novamente mais tarde.':'Use uma conta conectada para carregar os canais disponibilizados pelo PokeIdle. Os links abrem no navegador, fora dos painéis.'}</p></div>`);
  }
  function renderStones() {
    const root=$('#stones-content');if(!root)return;
    const openProfiles=state.profiles.filter(p=>state.openIds.includes(p.id));
    if(!openProfiles.some(p=>p.id===stonesProfileId))stonesProfileId=openProfiles.find(p=>p.id===state.focusedId)?.id||openProfiles[0]?.id||null;
    fillToolProfiles($('#stones-profile'),openProfiles,stonesProfileId);
    const data=state.tools?.market,matching=data?.profileId===stonesProfileId,market=matching?data:null;
    const scanning=Boolean(data?.scanning),loggedIn=Boolean(runtime(stonesProfileId).stats?.loggedIn);
    $('#stones-profile').disabled=scanning||!openProfiles.length;
    $('#stones-scan').disabled=isPreview||scanning||!stonesProfileId||!loggedIn;
    $('#stones-cancel').hidden=!scanning;
    const stamp=market?.at?timeLabel(market.at):null;
    const status=market?.error|| (scanning?`Consultando pedras… ${numeric(data.scanned,'0')} de ${numeric(data.total,'—')}${matching?'':` · ${profile(data.profileId)?.name||'outra conta'}`}`:!loggedIn?'Abra uma conta e entre no PokeIdle para consultar.':stamp?`Última consulta: ${stamp} · valores em ouro, por unidade`:'Consulte as ofertas e o histórico oficial de vendas do jogo.');
    $('#stones-status').classList.toggle('warning',Boolean(market?.error));
    setHTML($('#stones-status'),`${scanning?'<span class="spinner"></span>':icon(market?.error?'info':'clock')}<span>${esc(status)}</span>`);
    const catalog=Array.isArray(market?.catalog)?market.catalog:[];
    const onlyBelow=$('#stones-only-below').checked,minDiscount=Math.max(0,Math.min(100,Number($('#stones-min-discount').value)||0));
    const discount=item=>Number.isFinite(item.belowPercent)?item.belowPercent:Number.isFinite(item.average7d)&&item.average7d>0&&Number.isFinite(item.minUnitPrice)?(item.average7d-item.minUnitPrice)/item.average7d*100:null;
    const filtered=catalog.filter(item=>{
      const d=discount(item);
      if(onlyBelow&&(d===null||d<=0))return false;
      if(minDiscount>0&&(d===null||d<minDiscount))return false;
      return true;
    }).sort((a,b)=>(discount(b)??-Infinity)-(discount(a)??-Infinity));
    $('#stones-result-count').textContent=catalog.length?`${filtered.length} de ${catalog.length} pedras`:'';
    setHTML($('#stones-rows'),filtered.map(item=>{
      const d=discount(item),hasAverage=Number.isFinite(item.average7d)&&item.average7d>0;
      return `<tr><td title="${esc(item.name)}">${esc(item.name||`Item ${item.itemId}`)}</td><td class="numeric">${numeric(item.minUnitPrice)}<span class="gold-label">ouro</span></td><td class="numeric">${hasAverage?`${numeric(item.average7d)}<span class="gold-label">ouro</span>`:'<span class="history-unavailable">Sem histórico</span>'}</td><td class="numeric ${d>0?'price-below':'price-above'}">${d===null?'—':d===0?'Na média':`${d>0?'−':'+'}${decimal.format(Math.abs(d))}%`}</td><td><button class="button button-subtle" data-action="stone-view" data-item-id="${esc(item.itemId)}" data-id="${esc(market.profileId)}">Ver no jogo ${icon('arrow-up-right')}</button></td></tr>`;
    }).join(''));
    root.hidden=filtered.length>0;
    if(!filtered.length)setHTML(root,`<div class="tool-empty">${icon('gem')}<strong>${catalog.length?'Nenhuma pedra neste filtro':market?.available&&!scanning?'Nenhuma oferta encontrada':'Consulte o mercado do jogo'}</strong><p>${isPreview?'O scanner funciona no aplicativo Windows, com uma conta conectada. Esta prévia não contém preços simulados.':catalog.length?'A consulta não encontrou ofertas que atendam aos filtros. Reduza o desconto ou exiba também as pedras sem histórico.':scanning?'Lendo as ofertas disponíveis. Os resultados aparecem conforme a consulta avança.':market?.available?'Não foram encontradas ofertas de pedras nesta consulta. Você pode tentar novamente mais tarde.':'Selecione uma conta e clique em Buscar pedras. O comparativo usa o preço unitário e a média de vendas de 7 dias informada pelo PokeIdle.'}</p></div>`);
  }
  function fillToolProfiles(selector,profiles,id){
    const html=profiles.length?profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${runtime(p.id).stats?.loggedIn?'':' · aguardando login'}</option>`).join(''):'<option value="">Nenhuma conta aberta</option>';
    setHTML(selector,html);selector.value=id||'';selector.disabled=!profiles.length;
  }
  function timeLabel(at){
    const date=new Date(at);return Number.isNaN(date.getTime())?'horário indisponível':date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  $('#lives-profile').addEventListener('change',event=>{livesProfileId=event.target.value;renderLives();});
  $('#stones-profile').addEventListener('change',event=>{stonesProfileId=event.target.value;renderStones();});
  $('#stones-only-below').addEventListener('change',renderStones);
  $('#stones-min-discount').addEventListener('input',renderStones);

  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');
    if(!button||button.disabled)return;
    const {action,id}=button.dataset;
    const p=id?profile(id):null;
    switch(action){
      case 'profile-create':await openProfile();break;
      case 'profile-edit':await openProfile(id);break;
      case 'profile-color':selectedColor=button.dataset.value;renderColorOptions();break;
      case 'profile-delete':{
        if(!editingProfileId)break;
        const result=await call('profile:delete',{id:editingProfileId});
        if(result?.ok!==false&&!profile(editingProfileId))closeDialog();
        break;
      }
      case 'profile-select':await call(state.openIds.includes(id)?'panel:focus':'panel:open',{id});closeDialog();break;
      case 'panel-focus':await call('panel:focus',{id});break;
      case 'panel-expand':await call('panel:focus',{id});await call('layout:set',{layout:'single'});break;
      case 'panel-close':await call('panel:close',{id});break;
      case 'panel-reload':await call('panel:reload',{id});break;
      case 'panel-mute':if(p)await call('panel:mute',{id,muted:!p.muted});break;
      case 'zoom-minus':if(p)await call('panel:zoom',{id,zoom:Math.max(.35,Math.round(((p.zoom||.6)-.1)*100)/100)});break;
      case 'zoom-plus':if(p)await call('panel:zoom',{id,zoom:Math.min(1.5,Math.round(((p.zoom||.6)+.1)*100)/100)});break;
      case 'zoom-reset':await call('panel:zoom',{id,zoom:.6});break;
      case 'layout':await call('layout:set',{layout:button.dataset.layout});break;
      case 'open-all':for(const item of state.profiles)if(!state.openIds.includes(item.id))await call('panel:open',{id:item.id});closeDialog();break;
      case 'fullscreen':await call('window:fullscreen');break;
      case 'sidebar-toggle':await call('settings:update',{sidebarCollapsed:!state.sidebarCollapsed});break;
      case 'settings-open':await openDialog('settings-dialog');break;
      case 'profiles-open':await openDialog('profiles-dialog');break;
      case 'help-open':await openDialog('help-dialog');break;
      case 'farm-open':if(id)farmProfileId=id;await openDialog('farm-dialog');break;
      case 'dialog-close':closeDialog(button.closest('dialog'));break;
      case 'theme':await call('settings:update',{theme:button.dataset.themeValue});break;
      case 'keep-awake':await call('settings:update',{keepAwake:!state.keepAwake});break;
      case 'data-export':await call('data:export');break;
      case 'data-import':await call('data:import');break;
      case 'data-folder':await call('data:open-folder');break;
      case 'farm-start':await call('farm:start',{id});break;
      case 'farm-stop':await call('farm:stop',{id});break;
      case 'trial-delete':await call('trial:delete',{id});break;
      case 'sort-trials':trialSort={key:button.dataset.sort,direction:trialSort.key===button.dataset.sort?-trialSort.direction:-1};renderFarm();break;
      case 'game-tool':await call('game:tool',{id,tool:button.dataset.tool});break;
      case 'lives-open':await openDialog('lives-dialog');break;
      case 'stones-open':await openDialog('stones-dialog');break;
      case 'lives-refresh':if(livesProfileId)await call('game:tool',{id:livesProfileId,tool:'lives'});break;
      case 'live-open':await call('live:open',{url:button.dataset.url});break;
      case 'stones-scan':if(stonesProfileId)await call('game:tool',{id:stonesProfileId,tool:'scan-stones'});break;
      case 'stones-cancel':if(state.tools?.market?.profileId)await call('game:tool',{id:state.tools.market.profileId,tool:'cancel-scan'});break;
      case 'stone-view':{await call('panel:focus',{id});const result=await call('game:tool',{id,tool:'view-stone',itemId:button.dataset.itemId});if(result?.ok!==false)closeDialog();break;}
    }
  });
  document.addEventListener('keydown',async event=>{
    if(event.key==='F11'){event.preventDefault();await call('window:fullscreen');return;}
    if(activeDialog?.open)return;
    if((event.ctrlKey||event.metaKey)&&!event.altKey&&/^[1-4]$/.test(event.key)){
      event.preventDefault();const id=state.openIds[Number(event.key)-1];if(id)await call('panel:focus',{id});
    }
  });
  hydrateIcons();
  if(!bridge){toast('Não foi possível iniciar a interface do aplicativo.',true);return;}
  bridge.onState(acceptState);
  bridge.getState().then(acceptState).catch(error=>toast(error?.message||'Não foi possível carregar os perfis.',true));
})();
