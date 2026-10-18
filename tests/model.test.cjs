'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const m = require('../app/model.cjs');

test('cada perfil possui partição persistente própria; caminhos arbitrários são rejeitados', () => {
  const a = randomUUID(), b = randomUUID();
  assert.notEqual(m.partitionFor(a), m.partitionFor(b));
  assert.equal(m.partitionFor(a), m.partitionFor(a));
  assert.throws(() => m.partitionFor('../../Windows'));
});

test('restauração limita quatro perfis, elimina duplicatas e entradas inválidas', () => {
  const profiles = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: 'Conta ' + i, zoom: i * 9 }));
  const state = m.restoreState({ profiles: [profiles[0], profiles[0], { id: '../bad' }, ...profiles.slice(1)], openIds: [...profiles.map(x => x.id), 'bad', profiles[0].id], theme: 'invalid', focusedId: 'bad' });
  assert.equal(state.profiles.length, 4);
  assert.equal(new Set(state.profiles.map(p => p.id)).size, 4);
  assert.equal(state.openIds.length, 4);
  assert.equal(state.focusedId, profiles[0].id);
  assert.equal(state.theme, 'blue');
  assert.equal(state.toolbarHidden, false);
  assert.equal(state.huntEnabled, true);
  const updated = m.restoreState({ ...state, toolbarHidden: true, huntEnabled: false });
  assert.equal(updated.toolbarHidden, true);
  assert.equal(updated.huntEnabled, false);
  assert.deepEqual(updated.profiles, state.profiles);
  assert.deepEqual(updated.openIds, state.openIds);
  assert.ok(state.profiles.every(p => p.zoom >= 0.35 && p.zoom <= 1.5));
});

test('a atualização migra cores antigas para azul preservando perfis, sessões e preferências', () => {
  const profiles = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), name: 'Conta ' + i, color: ['#69dfb3', '#d4a6ff', '#f6c66f', '#ff9cb6'][i], zoom: 0.5 + i / 10, muted: i % 2 === 0, createdAt: 1000 + i }));
  const raw = { profiles, openIds: profiles.map(p => p.id), focusedId: profiles[2].id, layout: 'focus', toolbarHidden: true, huntEnabled: false, keepAwake: true };
  for (const theme of ['forest', 'ocean', 'violet']) {
    const restored = m.restoreState({ ...raw, theme });
    assert.equal(restored.theme, 'blue');
    assert.deepEqual(restored.profiles, profiles.map((p, i) => ({ ...p, color: m.PROFILE_COLORS[i] })));
    assert.deepEqual(restored.openIds, raw.openIds);
    assert.equal(restored.focusedId, raw.focusedId);
    assert.deepEqual(restored.profiles.map(p => m.partitionFor(p.id)), profiles.map(p => m.partitionFor(p.id)));
    assert.equal(restored.toolbarHidden, true);
    assert.equal(restored.huntEnabled, false);
    assert.equal(restored.keepAwake, true);
    assert.equal(restored.layout, 'focus');
    assert.equal(restored.focusLayout, 'focus');
    assert.deepEqual(m.restoreState(restored), restored, 'reopening preserves the migrated colors');
  }
});

test('a preferência de foco persiste ao voltar ao Multi e aceita backups anteriores', () => {
  assert.equal(m.restoreState({ layout: 'grid' }).focusLayout, 'single');
  assert.equal(m.restoreState({ layout: 'single' }).focusLayout, 'single');
  assert.equal(m.restoreState({ layout: 'focus' }).focusLayout, 'focus');
  const saved = m.restoreState({ layout: 'grid', focusLayout: 'focus' });
  assert.equal(saved.layout, 'grid');
  assert.equal(saved.focusLayout, 'focus');
  const restored = m.importPreferences(m.initialState(), m.exportPreferences(saved));
  assert.equal(restored.layout, 'grid');
  assert.equal(restored.focusLayout, 'focus');
  m.importPreferences(restored, { app: 'IdleBoard Isgroi', schemaVersion: 1, settings: { layout: 'single' } });
  assert.equal(restored.focusLayout, 'single');
  assert.equal(m.restoreState({ focusLayout: 'invalid' }).focusLayout, 'single');
});

test('navegação remota só permite o jogo e rotas conhecidas dos provedores', () => {
  for (const url of ['https://pokeidle.io/app','https://pokeidle.io/auth/google','https://accounts.google.com/signin/oauth','https://discord.com/oauth2/authorize?client_id=example','https://discord.com/login']) assert.ok(m.allowedNavigation(url));
  for (const url of ['file:///etc/passwd','javascript:alert(1)','https://pokeidle.io.evil.example/app','https://pokeidle.io@evil.example/','http://pokeidle.io/app','https://discord.com/channels/@me','https://pokeidle.io:999/app','https://example.com']) assert.equal(m.allowedNavigation(url), false);
});

test('bounds nativos são limitados à janela, números inválidos não passam', () => {
  assert.deepEqual(m.cleanBounds({ x: 900,y: 700,width: 500,height: 500 }, [1000,800]), { x:900,y:700,width:100,height:100 });
  assert.equal(m.cleanBounds({ x:0,y:0,width:NaN,height:900 },[1000,800]),null);
  assert.equal(m.cleanBounds({x:0,y:0,width:0,height:100},[1000,800]),null);
});

test('snapshots só preservam métricas permitidas e limpam dados ao sair', () => {
  const stats = m.sanitizeStats({ schemaVersion:1,loggedIn:true,nick:' Isgroi\u0000 ',password:'secret',token:'secret',cookies:'secret',gold:Infinity,trainerLevel:23,pokemon:{id:'1',name:'Bulbasaur',level:17},trainerXp:{current:50,target:100},status:'reconnecting' },123);
  assert.equal(stats.nick,'Isgroi');
  assert.equal(stats.gold,null);
  assert.equal(stats.at,123);
  assert.equal(stats.status,'reconnecting');
  assert.equal(JSON.stringify(stats).includes('secret'),false);
  const out = m.sanitizeStats({schemaVersion:1,loggedIn:false,nick:'private',pokemon:{name:'private'},gold:900});
  assert.equal(out.nick,'');
  assert.equal(out.pokemon,null);
  assert.equal(out.gold,null);
});

test('exportação exclui perfis, sessões e qualquer credencial mesmo se existir no input', () => {
  const s=m.initialState();
  s.profiles=[{id:randomUUID(),name:'Private',token:'secret',password:'secret'}];
  s.token='secret';
  s.toolbarHidden=true;
  s.huntEnabled=false;
  const out=m.exportPreferences(s);
  assert.equal(JSON.stringify(out).includes('secret'),false);
  assert.equal(Object.hasOwn(out,'profiles'),false);
  assert.equal(out.settings.toolbarHidden,true);
  assert.equal(out.settings.huntEnabled,false);
  assert.deepEqual(Object.keys(out).sort(),['app','exportedAt','schemaVersion','settings','trials']);
});

test('importação não cria ou altera sessões e recalcula taxas dos dados brutos', () => {
  const s=m.initialState();
  s.profiles=[{id:randomUUID(),name:'Minha conta'}];
  const id=s.profiles[0].id;
  m.importPreferences(s,{app:'IdleBoard Isgroi',schemaVersion:1,profiles:[{id:'malicious'}],settings:{theme:'violet',keepAwake:true,toolbarHidden:true,huntEnabled:false},trials:[{id:randomUUID(),profileName:'Medição',elapsedMs:120000,trainerXp:500,pokemonXp:1000,pokemonXpPerHour:9999999,goldDelta:-50}]});
  assert.equal(s.profiles[0].id,id);
  assert.equal(s.theme,'blue');
  assert.equal(s.keepAwake,false);
  assert.equal(s.toolbarHidden,true);
  assert.equal(s.huntEnabled,false);
  assert.equal(s.trials[0].pokemonXpPerHour,30000);
  assert.equal(s.trials[0].goldDelta,-50);
  assert.throws(()=>m.importPreferences(s,{app:'Other',schemaVersion:1}));
});

test('lives só abrem canais HTTPS conhecidos e eliminam URLs maliciosas', () => {
  assert.equal(m.liveURL('https://www.twitch.tv/isgroi?tracking=1'),'https://twitch.tv/isgroi');
  for (const value of ['file:///secret','https://twitch.tv.evil.example/a','https://twitch.tv@evil.example/a','https://kick.com/x/y','https://kick.com:999/x']) assert.equal(m.liveURL(value),null);
  const data=m.sanitizeLives({available:true,links:[{url:'https://twitch.tv/test',label:'Canal'},{url:'https://twitch.tv/test?x=y'},{url:'https://evil.example/test'}]},'profile');
  assert.equal(data.links.length,1);
  assert.equal(data.links[0].platform,'twitch');
});

test('comparação de pedras preserva preços unitários, desconhecidos e zero sem confiar no desconto recebido', () => {
  const out=m.sanitizeMarket({available:true,catalog:[
    {itemId:'fire_stone',name:'Fire Stone',currency:'gold',minUnitPrice:800,average7d:1000,belowPercent:99},
    {itemId:'water_stone',name:'Water Stone',currency:'gold',minUnitPrice:0,average7d:100},
    {itemId:'thunder_stone',currency:'gold',minUnitPrice:200,average7d:null},
    {itemId:'other',currency:'diamonds',minUnitPrice:1,average7d:1000},
  ]},'profile');
  assert.equal(out.catalog.length,3);
  assert.equal(out.catalog[0].belowPercent,20);
  assert.equal(out.catalog[1].belowPercent,100);
  assert.equal(out.catalog[2].belowPercent,null);
});
