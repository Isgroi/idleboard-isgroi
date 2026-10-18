'use strict';

/* Runs only in a regular browser. It never connects to, imitates, or logs into PokeIdle. */
if (!window.idleBoard) {
  (() => {
    const STORAGE_KEY='idleboard-isgroi-interface-preview-v1';
    const initial={version:'1.0.1',profiles:[],openIds:[],focusedId:null,layout:'grid',theme:'forest',keepAwake:false,sidebarCollapsed:false,toolbarHidden:false,huntEnabled:true,runtime:{},trials:[],system:{platform:'preview',electron:null,huntEnabledAtStartup:true}};
    let state={...initial};
    const listeners=new Set();
    try {
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(saved&&Array.isArray(saved.profiles))state={...initial,...saved,profiles:saved.profiles.slice(0,4),runtime:{},trials:[]};
    } catch { /* A private browser or malformed saved preview should still open. */ }
    state.version=initial.version;
    state.huntEnabled=state.huntEnabled!==false;
    state.system={...initial.system,huntEnabledAtStartup:state.huntEnabled};
    function normalize(){
      state.openIds=state.openIds.filter(id=>state.profiles.some(p=>p.id===id));
      if(!state.openIds.includes(state.focusedId))state.focusedId=state.openIds[0]||null;
      state.runtime=Object.fromEntries(state.openIds.map(id=>[id,{status:'ready',errorMessage:null,stats:null,farm:null,hunt:{status:'disabled',version:'1.0.3'}}]));
    }
    function snapshot(){return JSON.parse(JSON.stringify(state));}
    function publish(){
      normalize();
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...state,runtime:{},trials:[]}));}catch{/* Storage is optional for a visual preview. */}
      const next=snapshot();listeners.forEach(fn=>fn(next));return next;
    }
    normalize();
    window.idleBoard={
      isPreview:true,
      async getState(){return snapshot();},
      onState(fn){listeners.add(fn);return()=>listeners.delete(fn);},
      setBounds(){},
      async setOverlay(){},
      async act(action,payload={}){
        const p=state.profiles.find(item=>item.id===payload.id);
        switch(action){
          case 'profile:add':{
            if(state.profiles.length>=4)return{ok:false,error:'O limite é de quatro perfis.'};
            const name=String(payload.name||'').trim().slice(0,32);
            if(!name)return{ok:false,error:'Digite um nome para o perfil.'};
            const id=`preview-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            state.profiles.push({id,name,color:payload.color||'#b7e793',zoom:.6,muted:false,economy:false});
            state.openIds.push(id);state.focusedId=id;break;
          }
          case 'profile:update':if(p)Object.assign(p,{name:String(payload.name||p.name).trim().slice(0,32),color:payload.color||p.color});break;
          case 'profile:delete':
            if(!p)return{ok:false,error:'Perfil não encontrado.'};
            if(!window.confirm(`Excluir o perfil de prévia “${p.name}”? Nenhuma conta real está conectada.`))return{ok:false,canceled:true};
            state.profiles=state.profiles.filter(item=>item.id!==payload.id);break;
          case 'panel:open':if(p&&!state.openIds.includes(p.id)){state.openIds.push(p.id);state.focusedId=p.id;}break;
          case 'panel:close':state.openIds=state.openIds.filter(id=>id!==payload.id);break;
          case 'panel:focus':if(state.openIds.includes(payload.id))state.focusedId=payload.id;break;
          case 'panel:zoom':if(p)p.zoom=Math.min(1.5,Math.max(.35,Number(payload.zoom)||.6));break;
          case 'panel:mute':if(p)p.muted=Boolean(payload.muted);break;
          case 'layout:set':if(['grid','focus','single'].includes(payload.layout))state.layout=payload.layout;break;
          case 'toolbar:toggle':state.toolbarHidden=!state.toolbarHidden;break;
          case 'settings:update':
            if(['forest','ocean','violet'].includes(payload.theme))state.theme=payload.theme;
            if(typeof payload.sidebarCollapsed==='boolean')state.sidebarCollapsed=payload.sidebarCollapsed;
            if(typeof payload.huntEnabled==='boolean')state.huntEnabled=payload.huntEnabled;
            if(typeof payload.keepAwake==='boolean')return{ok:false,error:'Manter o computador ativo funciona no aplicativo Windows.'};
            break;
          case 'panel:reload':case 'panel:home':return{ok:true,message:'No aplicativo Windows, este botão recarrega a sessão real do PokeIdle.'};
          case 'window:fullscreen':return{ok:true,message:'Use F11 no navegador. O botão controla a janela no aplicativo Windows.'};
          case 'data:export':case 'data:import':case 'data:open-folder':return{ok:true,message:'Preferências, medições e dados locais são gerenciados no aplicativo Windows.'};
          case 'farm:start':case 'farm:stop':return{ok:false,error:'Medições exigem uma conta conectada no aplicativo Windows. Esta prévia não simula dados de jogo.'};
          case 'game:tool':return{ok:true,message:'Este atalho controla o jogo real no aplicativo Windows.'};
          case 'trial:delete':break;
          default:return{ok:false,error:'Este recurso está disponível no aplicativo Windows.'};
        }
        return{ok:true,state:publish()};
      }
    };
  })();
}
