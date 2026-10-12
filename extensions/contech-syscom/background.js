import {POLICY,SYS_ORIGINS,appOrigin,productURL,validModel,normalizeModel,rateStatus,LookupError} from './shared.js';

export function createController(api,{now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  let active=null;
  const session=async()=>{const [temporary,persistent]=await Promise.all([api.storage.session.get(['lock','readerTab','pending']),api.storage.local.get(['rate','paused'])]);return {...temporary,...persistent};};
  const settings=async()=>api.storage.local.get(['origins']);
  const popup=sender=>sender.id===api.runtime.id&&sender.url===api.runtime.getURL('popup.html');
  async function authorized(sender){const {origins=[]}=await settings();return sender.id===api.runtime.id&&sender.frameId===0&&Number.isInteger(sender.tab?.id)&&origins.includes(new URL(sender.url).origin);}
  async function checkpoint(job){if(active!==job||job.cancelled)throw new LookupError('cancelled','Consulta cancelada.');if(now()>job.expires)throw new LookupError('timeout','La consulta tardó demasiado. Revisa SYSCOM manualmente.');}
  function samePage(actual,expected){try{const a=new URL(actual),e=new URL(expected);return a.protocol==='https:'&&['www.syscom.mx','syscom.mx'].includes(a.hostname)&&a.pathname.replace(/\/$/,'')===e.pathname.replace(/\/$/,'')&&(e.pathname!=='/products'||normalizeModel(a.searchParams.get('query'))===normalizeModel(e.searchParams.get('query')));}catch{return false;}}
  async function checkPage(job){
    const tab=await api.tabs.get(job.tabId);
    if(!/^https:\/\/(?:www\.)?syscom\.mx\//.test(tab.url||'')){const reason='SYSCOM redirigió fuera de su sitio. Revisa la pestaña manualmente.';await api.storage.local.set({paused:reason});throw new LookupError('redirect',reason);}
    if(/^\/login(?:\/|$)/.test(new URL(tab.url).pathname))throw new LookupError('login','Inicia sesión manualmente en SYSCOM y vuelve a consultar el modelo.');
    if(!samePage(tab.url,job.url))throw new LookupError('changed','La pestaña cambió durante la consulta. Revisa el modelo y vuelve a buscar cuando corresponda.');
  }
  async function state(){const [{origins=[]},stored]=await Promise.all([settings(),session()]);const rate=rateStatus(stored.rate?.history,stored.rate?.last,now());return {origins,paused:stored.paused||null,busy:Boolean(active||stored.lock&&stored.lock.expires>now()),retryAfter:rate.retryAfter,remaining:rate.remaining,interval:POLICY.interval};}
  async function acquire(sender,{count=true}={}){
    if(active)throw new LookupError('busy','Hay otra consulta en curso. Espera a que termine.');
    const job={id:crypto.randomUUID(),appTab:sender.tab.id,expires:now()+POLICY.jobTimeout,cancelled:false};active=job;
    try{
      const stored=await session();
      if(stored.lock&&stored.lock.expires>now())throw new LookupError('busy','Hay otra consulta en curso. Espera a que termine.');
      if(stored.paused)throw new LookupError('paused',stored.paused+' Reanuda desde el icono de la extensión cuando hayas revisado SYSCOM.');
      const rate=rateStatus(stored.rate?.history,stored.rate?.last,now());
      if(count&&rate.retryAfter>0)throw new LookupError('rate',`Espera ${Math.ceil(rate.retryAfter/1000)} segundos antes de otra búsqueda.`,rate.retryAfter);
      await api.storage.session.set({lock:{id:job.id,appTab:job.appTab,expires:job.expires}});
      if(count)await api.storage.local.set({rate:{history:[...rate.recent,now()],last:now()}});return job;
    }catch(error){active=null;throw error;}
  }
  async function release(job){if(active===job)active=null;const stored=await session();if(stored.lock?.id===job.id)await api.storage.session.remove('lock');}
  function loaded(tabId,job){return new Promise((resolve,reject)=>{
    let done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);api.tabs.onUpdated.removeListener(updated);api.tabs.onRemoved.removeListener(removed);error?reject(error):resolve();};
    const updated=(id,change)=>{if(id===tabId&&change.status==='complete')finish();};
    const removed=id=>{if(id===tabId)finish(new LookupError('cancelled','La pestaña de consulta se cerró.'));};
    const timer=setTimeout(()=>finish(new LookupError('timeout','SYSCOM no terminó de cargar. Revisa la pestaña manualmente.')),Math.min(25000,Math.max(1,job.expires-now())));
    api.tabs.onUpdated.addListener(updated);api.tabs.onRemoved.addListener(removed);
    api.tabs.get(tabId).then(tab=>{if(job.cancelled)finish(new LookupError('cancelled','Consulta cancelada.'));else if(tab.status==='complete')finish();}).catch(()=>finish(new LookupError('cancelled','La pestaña de consulta se cerró.')));
  });}
  async function navigate(job,url){
    await checkpoint(job);const stored=await session();let tab;
    if(stored.readerTab)try{const previous=await api.tabs.get(stored.readerTab),address=new URL(previous.url);if(address.protocol==='https:'&&['www.syscom.mx','syscom.mx'].includes(address.hostname)&&/^\/(?:products(?:\/\d+)?)?\/?$/.test(address.pathname))tab=previous;}catch{}
    await checkpoint(job);
    if(tab)tab=await api.tabs.update(tab.id,{url,active:false});else{tab=await api.tabs.create({url,active:false});await api.storage.session.set({readerTab:tab.id});}
    job.tabId=tab.id;job.url=url;await checkpoint(job);await loaded(tab.id,job);await checkpoint(job);await checkPage(job);
    return tab.id;
  }
  async function read(job,kind){
    await checkpoint(job);await checkPage(job);let result;
    const readOnce=async()=>{let timer;try{return await Promise.race([api.tabs.sendMessage(job.tabId,{type:'syscom-read',kind,timeout:Math.min(15000,Math.max(1,job.expires-now()))}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new LookupError('timeout','La lectura tardó demasiado. Revisa SYSCOM manualmente.')),Math.max(1,job.expires-now()));})]);}finally{clearTimeout(timer);}};
    try{result=await readOnce();}
    catch{
      await checkpoint(job);await api.scripting.executeScript({target:{tabId:job.tabId},files:['dom-reader.js','reader.js']});
      result=await readOnce();
    }
    await checkpoint(job);await checkPage(job);
    if(result?.error){if(result.error.code==='blocked')await api.storage.local.set({paused:result.error.message});throw new LookupError(result.error.code,result.error.message);}
    return result;
  }
  async function detail(job,candidate){
    const url=productURL(candidate.url);if(!url)throw new LookupError('url','El enlace del producto no es válido.');
    await wait(POLICY.detailPause);await checkpoint(job);await navigate(job,url);const result=await read(job,'product');
    if(!result?.product||normalizeModel(result.product.model)!==normalizeModel(candidate.model))throw new LookupError('model','La ficha abierta no coincide con el modelo elegido. Revisa el producto manualmente.');
    return {kind:'product',product:result.product};
  }
  async function search(message,sender){
    if(!validModel(message.model))throw new LookupError('model','Escribe un modelo de entre 2 y 100 caracteres.');
    const job=await acquire(sender);
    try{
      await navigate(job,'https://www.syscom.mx/products?query='+encodeURIComponent(message.model.trim()));
      const result=await read(job,'search');
      const candidates=(result.candidates||[]).filter(candidate=>productURL(candidate.url)&&validModel(candidate.model));
      if(!candidates.length)throw new LookupError('not-found','No se encontraron productos en la primera página. Revisa el modelo o búscalo manualmente en SYSCOM.');
      const exact=candidates.filter(candidate=>normalizeModel(candidate.model)===normalizeModel(message.model));
      if(exact.length===1)return await detail(job,exact[0]);
      const choices=(exact.length?exact:candidates).slice(0,8),token=crypto.randomUUID();
      const stored=await session(),pending=Object.fromEntries(Object.entries(stored.pending||{}).filter(([,value])=>value.expires>now()&&value.appTab!==sender.tab.id));
      pending[token]={appTab:sender.tab.id,expires:now()+POLICY.pendingTimeout,choices};await api.storage.session.set({pending});
      return {kind:'candidates',token,candidates:choices,exact:exact.length>0};
    }finally{await release(job);}
  }
  async function select(message,sender){
    const stored=await session(),pending=stored.pending?.[message.token];
    if(!pending||pending.appTab!==sender.tab.id||pending.expires<=now())throw new LookupError('expired','La selección venció. Vuelve a buscar el modelo.');
    const candidate=pending.choices[message.index];if(!Number.isInteger(message.index)||!candidate)throw new LookupError('selection','Elige uno de los productos encontrados.');
    const job=await acquire(sender,{count:false});
    try{const result=await detail(job,candidate);const entries=(await session()).pending||{};delete entries[message.token];await api.storage.session.set({pending:entries});return result;}finally{await release(job);}
  }
  async function configure(message){
    const origin=appOrigin(message.url),granted=await api.permissions.contains({origins:[origin+'/*',...SYS_ORIGINS]});
    if(!granted)throw new LookupError('permissions','Autoriza el acceso a la app y a SYSCOM desde el botón Conectar.');
    const stored=await settings(),requested=[...new Set([...(stored.origins||[]),origin])].slice(-5),origins=[];
    for(const value of requested)if(await api.permissions.contains({origins:[value+'/*']}))origins.push(value);
    await api.scripting.unregisterContentScripts();
    await api.scripting.registerContentScripts([
      {id:'contech-syscom-reader',matches:SYS_ORIGINS,js:['dom-reader.js','reader.js'],runAt:'document_idle',persistAcrossSessions:true},
      ...origins.map((value,index)=>({id:'contech-app-'+index,matches:[value+'/*'],js:['app-bridge.js'],runAt:'document_idle',persistAcrossSessions:true}))
    ]);
    await api.storage.local.set({origins});
    if(Number.isInteger(message.tabId)){const tab=await api.tabs.get(message.tabId);if(new URL(tab.url).origin===origin)await api.scripting.executeScript({target:{tabId:tab.id},files:['app-bridge.js']});}
    return state();
  }
  async function handle(message,sender){
    try{
      if(sender?.id!==api.runtime.id||!message||typeof message.action!=='string')throw new LookupError('sender','Solicitud no autorizada.');
      if(popup(sender)){
        if(message.action==='configure')return {ok:true,data:await configure(message)};
        if(message.action==='state')return {ok:true,data:await state()};
        if(message.action==='pause'){await api.storage.local.set({paused:'Consultas pausadas por el usuario.'});if(active)active.cancelled=true;return {ok:true,data:await state()};}
        if(message.action==='resume'){if(active)throw new LookupError('busy','Espera a que termine la consulta actual.');await api.storage.local.remove('paused');return {ok:true,data:await state()};}
        if(message.action==='open-site'){const stored=await session();if(stored.readerTab)try{const tab=await api.tabs.get(stored.readerTab);if(/^https:\/\/(?:www\.)?syscom\.mx\//.test(tab.url||'')){await api.tabs.update(tab.id,{active:true});return {ok:true,data:{}};}}catch{}await api.tabs.create({url:'https://www.syscom.mx/',active:true});return {ok:true,data:{}};}
      }
      if(!await authorized(sender))throw new LookupError('not-connected','Conecta esta app desde el icono de la extensión de Contech.');
      if(message.action==='ping')return {ok:true,data:await state()};
      if(message.action==='search')return {ok:true,data:await search(message,sender)};
      if(message.action==='select')return {ok:true,data:await select(message,sender)};
      if(message.action==='cancel'){
        if(active?.appTab===sender.tab.id){active.cancelled=true;if(active.tabId)try{const tab=await api.tabs.get(active.tabId);if(samePage(tab.url,active.url))await api.tabs.remove(active.tabId);}catch{}}
        return {ok:true,data:{cancelled:true}};
      }
      throw new LookupError('action','La acción no está disponible.');
    }catch(error){return {ok:false,error:{code:error.code||'extension',message:error.code?error.message:'No se pudo completar la consulta. Revisa la pestaña de SYSCOM.',retryAfter:error.retryAfter||0}};}
  }
  return {handle,state};
}
if(globalThis.chrome?.runtime?.onMessage){const controller=createController(chrome);chrome.runtime.onMessage.addListener((message,sender,reply)=>{controller.handle(message,sender).then(reply);return true;});}
