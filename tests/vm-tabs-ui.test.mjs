import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
// Import before binding a document: the portal's page bootstrap should not run
// until each fixture supplies its browser and deliberately delayed tool load.
import {initPortal} from '../portal.js?vm-tabs-test';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const bridge=await readFile(new URL('../extensions/contech-syscom/app-bridge.js',import.meta.url),'utf8');
const sections=['data','equipment','labor','volume','miscellaneous'];
const DRAFT_KEY='contech-matrix-draft';let fixtureId=0;

async function fixture(t,{deferMatrix=false}={}){
  const dom=new JSDOM(html,{url:'https://contech-tabs-test.onrender.com/',runScripts:'outside-only'}),win=dom.window;
  const previous={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout,setInterval:globalThis.setInterval};
  const timers=new Set(),intervals=new Set();let alive=true,connection='ready';const actions=[];
  Object.assign(globalThis,{window:win,document:win.document});
  globalThis.setTimeout=(callback,delay,...args)=>{const handle=previous.setTimeout(callback,delay,...args);handle.unref?.();timers.add(handle);return handle;};
  globalThis.setInterval=(callback,delay,...args)=>{const handle=previous.setInterval(callback,delay,...args);handle.unref?.();intervals.add(handle);return handle;};
  t.after(()=>{alive=false;for(const timer of timers)clearTimeout(timer);for(const interval of intervals)clearInterval(interval);dom.window.close();Object.assign(globalThis,previous);});
  win.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  win.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});win.scrollTo=()=>{};
  win.confirm=()=>assert.fail('La navegación y la conexión no necesitan confirmación.');win.alert=()=>assert.fail('No debe haber alertas bloqueantes.');
  win.postMessage=(data,origin)=>{assert.equal(origin,win.location.origin);setImmediate(()=>{if(alive)win.dispatchEvent(new win.MessageEvent('message',{data,origin,source:win}));});};
  win.chrome={runtime:{async sendMessage(message){
    actions.push(message.action);
    if(message.action==='ping'){
      if(connection==='disconnected')throw new Error('Extensión desconectada.');
      return {ok:true,data:{paused:connection==='paused'?{code:'paused',message:'Consultas pausadas.'}:null,retryAfter:0}};
    }
    throw new Error('La prueba de pestañas no debe consultar productos: '+message.action);
  }}};win.eval(bridge);
  const moduleUrl=new URL('../vm-ui.js',import.meta.url);moduleUrl.searchParams.set('tabs-test',String(++fixtureId));
  const {initMatrixBuilder}=await import(moduleUrl.href);if(!deferMatrix)initMatrixBuilder();
  const $=id=>win.document.getElementById(id),cards=section=>[...$('vm-'+section+'-list').querySelectorAll('.vm-item')];
  function input(control,value){control.value=value;control.dispatchEvent(new win.Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));}
  const fill=(card,key,value)=>input(card.querySelector('[data-key="'+key+'"]'),value);
  const key=(control,key)=>control.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true}));
  async function waitFor(check){for(let i=0;i<150;i++){if(check())return;await new Promise(resolve=>previous.setTimeout(resolve,10));}assert.fail('No llegó el estado esperado.');}
  if(!deferMatrix)await waitFor(()=>$('vm-extension-control').dataset.state==='ready');
  return {$,cards,input,fill,key,waitFor,actions,win,initMatrixBuilder,draft:()=>JSON.parse(win.localStorage.getItem(DRAFT_KEY)),setConnection:value=>{connection=value;}};
}

function selected(ui,name){
  for(const section of sections){
    const tab=ui.$('vm-tab-'+section),panel=ui.$('vm-'+section+'-section'),active=section===name;
    assert.equal(tab.getAttribute('role'),'tab');assert.equal(panel.getAttribute('role'),'tabpanel');
    assert.equal(tab.getAttribute('aria-controls'),panel.id);assert.equal(panel.getAttribute('aria-labelledby'),tab.id);
    assert.equal(tab.getAttribute('aria-selected'),String(active));assert.equal(tab.tabIndex,active?0:-1);assert.equal(panel.hidden,!active);
  }
}

test('las pestañas muestran una hoja por vez y conservan campos y tarjetas al cambiar',async t=>{
  const ui=await fixture(t);selected(ui,'data');
  for(const section of sections.slice(2)){assert.equal(ui.$('vm-enable-'+section),null);assert.equal(ui.cards(section).length,0);}
  ui.input(ui.$('vm-client'),'Tabachines');ui.input(ui.$('vm-project'),'Cámaras');ui.input(ui.$('vm-exchange-rate'),'19.123456789');
  ui.$('vm-tab-equipment').click();selected(ui,'equipment');const card=ui.cards('equipment')[0];
  ui.fill(card,'concept','Cámara exterior');ui.fill(card,'description','Detalle que se conserva');ui.fill(card,'unitCost','100.123456789');
  ui.$('vm-add-equipment').click();const second=ui.cards('equipment')[1];
  ui.fill(second,'concept','Equipo adicional');assert.equal(card.querySelector('details').open,false);
  for(const section of sections.slice(2)){ui.$('vm-tab-'+section).click();selected(ui,section);assert.equal(ui.cards(section).length,0,'Abrir una hoja no agrega partidas.');}
  ui.$('vm-tab-data').click();selected(ui,'data');assert.equal(ui.$('vm-client').value,'Tabachines');assert.equal(ui.$('vm-exchange-rate').value,'19.123456789');
  ui.$('vm-tab-equipment').click();selected(ui,'equipment');assert.equal(ui.cards('equipment').length,2);
  assert.equal(card.querySelector('[data-key="description"]').value,'Detalle que se conserva');assert.equal(card.querySelector('[data-key="unitCost"]').value,'100.123456789');
  assert.equal(card.querySelector('details').open,false);assert.equal(second.querySelector('details').open,true);assert.equal(ui.draft().ui.activeTab,'equipment');
  assert.equal(ui.actions.filter(action=>action!=='ping').length,0);
});

test('el teclado recorre las pestañas con flechas, Inicio y Fin sin modificar datos',async t=>{
  const ui=await fixture(t);ui.input(ui.$('vm-client'),'Cliente conservado');ui.$('vm-tab-data').focus();
  ui.key(ui.$('vm-tab-data'),'ArrowRight');selected(ui,'equipment');assert.equal(ui.win.document.activeElement,ui.$('vm-tab-equipment'));
  ui.key(ui.$('vm-tab-equipment'),'End');selected(ui,'miscellaneous');assert.equal(ui.win.document.activeElement,ui.$('vm-tab-miscellaneous'));
  ui.key(ui.$('vm-tab-miscellaneous'),'ArrowRight');selected(ui,'data');
  ui.key(ui.$('vm-tab-data'),'ArrowLeft');selected(ui,'miscellaneous');
  ui.key(ui.$('vm-tab-miscellaneous'),'Home');selected(ui,'data');assert.equal(ui.win.document.activeElement,ui.$('vm-tab-data'));
  assert.equal(ui.$('vm-client').value,'Cliente conservado');for(const section of sections.slice(2))assert.equal(ui.cards(section).length,0);
});

test('las hojas opcionales se incluyen según sus datos y las tarjetas vacías no bloquean la matriz',async t=>{
  const ui=await fixture(t);ui.input(ui.$('vm-client'),'Tabachines');ui.input(ui.$('vm-project'),'Venta e instalación');
  ui.$('vm-tab-equipment').click();ui.fill(ui.cards('equipment')[0],'concept','Cámara');
  assert.equal(ui.$('vm-download').disabled,false);assert.equal(ui.$('vm-item-count').textContent,'1');
  for(const section of ['labor','volume','miscellaneous']){
    ui.$('vm-tab-'+section).click();ui.$('vm-add-'+section).click();const card=ui.cards(section)[0];
    assert.equal(card.querySelector('[data-key="quantity"]').value,'','Una partida opcional recién agregada debe estar vacía.');
    assert.equal(ui.draft().state[section].enabled,false);assert.equal(ui.$('vm-download').disabled,false);assert.equal(ui.$('vm-item-count').textContent,'1');
    ui.fill(card,'description','Descripción pendiente');assert.equal(ui.draft().state[section].enabled,true);
    assert.equal(ui.$('vm-download').disabled,true);assert.match(ui.$('vm-ready-status').textContent,/concepto/i);
    ui.$('vm-tab-data').click();ui.$('vm-review-issues').click();selected(ui,section);
    assert.equal(ui.win.document.activeElement,card.querySelector('[data-key="concept"]'),'La revisión debe llevar al dato faltante aunque esté en otra pestaña.');
    ui.fill(card,'concept','Partida '+section);assert.equal(ui.$('vm-download').disabled,false);
    ui.fill(card,'quantity','2');ui.fill(card,'unitCost','20.123456');assert.equal(ui.draft().state[section].items[0].unitCost,'20.123456');
    ui.fill(card,'description','');ui.fill(card,'quantity','');ui.fill(card,'unitCost','');ui.fill(card,'concept','');
    assert.equal(ui.draft().state[section].enabled,false);assert.equal(ui.$('vm-download').disabled,false);assert.equal(ui.$('vm-item-count').textContent,'1');
    ui.fill(card,'concept','Partida por eliminar');assert.equal(ui.draft().state[section].enabled,true);card.querySelector('.icon-button').click();
    assert.equal(ui.cards(section).length,0);assert.equal(ui.draft().state[section].enabled,false);assert.equal(ui.$('vm-download').disabled,false);
  }
});

test('la conexión de SYSCOM se consulta desde el icono y su menú se cierra sin diálogos bloqueantes',async t=>{
  const ui=await fixture(t),control=ui.$('vm-extension-control'),toggle=ui.$('vm-syscom-toggle'),menu=ui.$('vm-syscom-menu');
  assert.equal(control.hidden,false);assert.equal(control.dataset.state,'ready');assert.match(toggle.getAttribute('aria-label'),/conectad/i);
  assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(menu.hidden,true);assert.equal(menu.getAttribute('role'),'region');
  toggle.click();assert.equal(menu.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.ok(menu.querySelector('a[href*="contech-syscom-extension.zip"]'),'El menú debe conservar la descarga de la extensión.');
  assert.ok(menu.contains(ui.$('vm-syscom-status')));assert.ok(menu.contains(ui.$('vm-syscom-refresh')));
  ui.$('vm-syscom-close').click();assert.equal(menu.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');
  toggle.click();ui.$('vm-tab-equipment').dispatchEvent(new ui.win.Event('pointerdown',{bubbles:true}));ui.$('vm-tab-equipment').click();assert.equal(menu.hidden,true,'Una interacción fuera del menú debe cerrarlo.');
  toggle.click();ui.key(toggle,'Escape');assert.equal(menu.hidden,true);assert.equal(ui.win.document.activeElement,toggle);
  ui.setConnection('paused');ui.$('vm-syscom-refresh').click();await ui.waitFor(()=>control.dataset.state==='warning');
  assert.match(toggle.getAttribute('aria-label'),/pausa/i);assert.match(ui.$('vm-syscom-status').textContent,/pausa/i);
  ui.setConnection('disconnected');ui.$('vm-syscom-refresh').click();await ui.waitFor(()=>control.dataset.state==='disconnected');
  assert.match(toggle.getAttribute('aria-label'),/desconectad|sin.*extensi|no.*conectad|no.*instalad|no.*disponible/i);assert.equal(menu.hidden,true);
  ui.setConnection('ready');ui.$('vm-syscom-refresh').click();await ui.waitFor(()=>control.dataset.state==='ready');assert.match(toggle.getAttribute('aria-label'),/conectad/i);
  assert.equal(ui.actions.filter(action=>action!=='ping').length,0);
});

test('una carga tardía de la matriz respeta la navegación a Inicio y cierra el menú al salir',async t=>{
  const ui=await fixture(t,{deferMatrix:true});let finishLoading,started=false;
  const loading=new Promise(resolve=>{finishLoading=resolve;});
  const tools=[{id:'matrix-builder',slug:'crear-matriz',viewId:'vm-view',headingId:'vm-title',title:'Crear matriz (VM)',description:'Matriz de prueba.',icon:'',formats:['Excel'],load:async()=>{started=true;await loading;ui.initMatrixBuilder();}}];
  ui.win.history.replaceState(null,'','#/crear-matriz');
  const opening=initPortal({tools,document:ui.win.document,window:ui.win});
  await ui.waitFor(()=>started);assert.equal(ui.$('vm-view').hidden,false);assert.equal(ui.$('tool-load-notice').hidden,false);
  // The user leaves before the lazy module finishes loading. The late module
  // must not expose a matrix-only header control over the tools home screen.
  ui.win.location.hash='#/herramientas';await ui.waitFor(()=>!ui.$('tools-home').hidden&&ui.$('vm-extension-control').hidden);
  finishLoading();await opening;await ui.waitFor(()=>ui.$('vm-extension-control').dataset.state==='ready');
  assert.equal(ui.$('tools-home').hidden,false);assert.equal(ui.$('vm-view').hidden,true);assert.equal(ui.$('vm-extension-control').hidden,true);assert.equal(ui.$('vm-syscom-menu').hidden,true);
  ui.win.location.hash='#/crear-matriz';await ui.waitFor(()=>!ui.$('vm-view').hidden&&!ui.$('vm-extension-control').hidden&&ui.$('tool-load-notice').hidden);
  ui.$('vm-syscom-toggle').click();assert.equal(ui.$('vm-syscom-menu').hidden,false);
  ui.win.location.hash='#/herramientas';await ui.waitFor(()=>!ui.$('tools-home').hidden&&ui.$('vm-extension-control').hidden);
  assert.equal(ui.$('vm-syscom-menu').hidden,true);assert.equal(ui.$('vm-syscom-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(ui.actions.filter(action=>action!=='ping').length,0);
});
