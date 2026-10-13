import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {VM_DEFAULTS} from '../vm-core.js';

const DRAFT_KEY='contech-matrix-draft';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const bridge=await readFile(new URL('../extensions/contech-syscom/app-bridge.js',import.meta.url),'utf8');
const settingsFields={exchangeRate:'vm-exchange-rate',indirectPct:'vm-indirect-pct',feePct:'vm-fee-pct',commissionPct:'vm-commission-pct',provisionPct:'vm-provision-pct',rounding:'vm-rounding'};
let fixtureId=0;

async function fixture(t,{stored={},writeDenied=false,removeDenied=false,accessDenied=false}={}){
  const dom=new JSDOM(html,{url:'https://contech-test.onrender.com/',runScripts:'outside-only'}),win=dom.window;
  const storage=win.localStorage;
  for(const [key,value] of Object.entries(stored))storage.setItem(key,value);
  if(writeDenied){
    const setItem=win.Storage.prototype.setItem;
    win.Storage.prototype.setItem=function(key,value){
      if(key===DRAFT_KEY)throw new win.DOMException('Sin espacio disponible.','QuotaExceededError');
      return setItem.call(this,key,value);
    };
  }
  if(removeDenied){
    const removeItem=win.Storage.prototype.removeItem;
    win.Storage.prototype.removeItem=function(key){
      if(key===DRAFT_KEY)throw new win.DOMException('No se puede eliminar el borrador.','SecurityError');
      return removeItem.call(this,key);
    };
  }
  if(accessDenied)Object.defineProperty(win,'localStorage',{get(){throw new win.DOMException('Almacenamiento bloqueado.','SecurityError');}});
  const previous={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout,setInterval:globalThis.setInterval};
  const timers=new Set(),intervals=new Set();let alive=true;
  Object.assign(globalThis,{window:win,document:win.document});
  globalThis.setTimeout=(callback,delay,...args)=>{const handle=previous.setTimeout(callback,delay,...args);handle.unref?.();timers.add(handle);return handle;};
  globalThis.setInterval=(callback,delay,...args)=>{const handle=previous.setInterval(callback,delay,...args);handle.unref?.();intervals.add(handle);return handle;};
  function close(){
    if(!alive)return;alive=false;
    for(const timer of timers)clearTimeout(timer);
    for(const interval of intervals)clearInterval(interval);
    dom.window.close();Object.assign(globalThis,previous);
  }
  t.after(close);
  // JSDOM does not implement the native dialog lifecycle. Keep the browser
  // semantics explicit so cancellation and confirmation exercise the real UI.
  win.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  win.HTMLDialogElement.prototype.close=function(value=''){this.returnValue=value;this.removeAttribute('open');this.dispatchEvent(new win.Event('close'));};
  win.confirm=()=>assert.fail('La limpieza debe usar su diálogo de confirmación.');
  win.alert=()=>assert.fail('La edición no debe abrir alertas bloqueantes.');
  const actions=[];
  const product={model:'CAM-001',concept:'Cámara consultada',description:'Precio pendiente de revisión.',brand:'Marca',supplier:'SYSCOM',url:'https://www.syscom.mx/products/1',price:null,priceChoices:[{unitCost:1175.18,currency:'USD',withIVA:false,label:'Precio de compra'}],loginRequired:false};
  win.postMessage=(data,origin)=>{
    assert.equal(origin,win.location.origin);
    setImmediate(()=>{if(alive)win.dispatchEvent(new win.MessageEvent('message',{data,origin,source:win}));});
  };
  win.chrome={runtime:{async sendMessage(message){
    actions.push(message.action);
    if(message.action==='ping')return {ok:true,data:{paused:null,retryAfter:0}};
    if(message.action==='search')return {ok:true,data:{kind:'product',product:structuredClone(product)}};
    throw new Error('Acción inesperada: '+message.action);
  }}};
  win.eval(bridge);
  const moduleUrl=new URL('../vm-ui.js',import.meta.url);moduleUrl.searchParams.set('draft-test',String(++fixtureId));
  const {initMatrixBuilder}=await import(moduleUrl.href);initMatrixBuilder();
  const $=id=>win.document.getElementById(id);
  const cards=(section='equipment')=>[...$('vm-'+section+'-list').querySelectorAll('.vm-item')];
  function input(control,value){control.value=value;control.dispatchEvent(new win.Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));}
  const fill=(card,key,value)=>input(card.querySelector('[data-key="'+key+'"]'),value);
  function openSection(section){$('vm-tab-'+section).click();if(!cards(section).length)$('vm-add-'+section).click();}
  function expand(card,open){const detail=card.querySelector('details');detail.open=open;detail.dispatchEvent(new win.Event('toggle'));}
  async function waitFor(check){
    for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>previous.setTimeout(resolve,10));}
    assert.fail('No llegó el estado esperado.');
  }
  const draft=()=>JSON.parse(storage.getItem(DRAFT_KEY));
  const snapshot=()=>Object.fromEntries(Array.from({length:storage.length},(_,i)=>storage.key(i)).map(key=>[key,storage.getItem(key)]));
  async function query(card){
    fill(card,'model','CAM-001');await waitFor(()=>!card.querySelector('.vm-lookup-button').disabled);
    card.querySelector('.vm-lookup-button').click();
    await waitFor(()=>!card.querySelector('.vm-lookup-button').disabled&&card.querySelector('[data-key="concept"]').value==='Cámara consultada');
  }
  function escape(dialog){
    const event=new win.Event('cancel',{cancelable:true});dialog.dispatchEvent(event);
    if(!event.defaultPrevented&&dialog.open)dialog.close();
  }
  await waitFor(()=>$('vm-syscom-status').textContent.includes('Extensión conectada'));
  const pause=milliseconds=>new Promise(resolve=>previous.setTimeout(resolve,milliseconds));
  return {$,cards,input,fill,openSection,expand,waitFor,draft,snapshot,query,escape,actions,storage,win,close,pause};
}

test('el borrador de la matriz sobrevive a una recarga sin consultas ni generación automática',async t=>{
  const first=await fixture(t,{stored:{'contech-theme':'dark','otra-herramienta':'conservar'}});
  first.input(first.$('vm-client'),'Residencial Tabachines');first.input(first.$('vm-project'),'Cámaras y acceso');
  for(const [key,value] of Object.entries({exchangeRate:'19.87654321',indirectPct:'20,125',feePct:'55.125',commissionPct:'4.75',provisionPct:'2.25',rounding:'unit-rounded'}))first.input(first.$(settingsFields[key]),value);
  const equipment=first.cards()[0];
  for(const [key,value] of Object.entries({concept:'Bobina exterior',description:'Descripción\ncon segunda línea',model:'CAT6-152',brand:'Marca de prueba',supplier:'Proveedor local',quantity:'2,5',unitCost:'151.23456789',currency:'MXN'}))first.fill(equipment,key,value);
  // Saving is immediate, including raw decimal precision, before any timer fires.
  assert.equal(first.draft().state.equipment[0].unitCost,'151.23456789');
  first.$('vm-add-equipment').click();const unfinished=first.cards()[1];
  first.fill(unfinished,'description','Partida a medio llenar');first.fill(unfinished,'quantity','');
  first.openSection('labor');const labor=first.cards('labor')[0];
  first.fill(labor,'concept','Instalación');first.fill(labor,'quantity','75');first.fill(labor,'unitCost','49.248');
  first.$('vm-add-labor').click();first.fill(first.cards('labor')[1],'description','Servicio todavía sin concepto');
  first.openSection('volume');const volume=first.cards('volume')[0];
  first.fill(volume,'concept','Cable utilizado');first.fill(volume,'quantity','75');first.fill(volume,'sourceEquipment',equipment.dataset.item);first.fill(volume,'unitsPerPack','152');
  first.openSection('miscellaneous');const miscellaneous=first.cards('miscellaneous')[0];
  first.fill(miscellaneous,'concept','Conectores');first.fill(miscellaneous,'description','Precio por confirmar');first.fill(miscellaneous,'unitCost','');
  first.expand(equipment,false);first.expand(unfinished,true);
  const saved=first.draft(),stored=first.snapshot();
  assert.equal(saved.version,1);assert.equal(saved.state.labor.enabled,true);assert.equal(saved.state.labor.items.length,2);
  assert.equal(saved.ui.activeTab,'miscellaneous');
  assert.equal(saved.ui.equipment[equipment.dataset.item].open,false);
  assert.equal(saved.state.equipment[1].concept,'');assert.equal(saved.state.equipment[1].quantity,'');
  first.close();

  const restored=await fixture(t,{stored});
  assert.deepEqual(restored.draft().state,saved.state);
  assert.equal(restored.$('vm-tab-miscellaneous').getAttribute('aria-selected'),'true');assert.equal(restored.$('vm-miscellaneous-section').hidden,false);
  assert.equal(restored.$('vm-client').value,'Residencial Tabachines');assert.equal(restored.$('vm-project').value,'Cámaras y acceso');
  for(const [key,id] of Object.entries(settingsFields))assert.equal(restored.$(id).value,String(saved.state.settings[key]));
  assert.equal(restored.cards().length,2);assert.equal(restored.cards()[0].querySelector('details').open,false);assert.equal(restored.cards()[1].querySelector('details').open,true);
  assert.equal(restored.$('vm-enable-labor'),null);assert.equal(restored.$('vm-labor-section').hidden,true);assert.equal(restored.cards('labor').length,2);
  restored.openSection('labor');assert.equal(restored.$('vm-labor-section').hidden,false);assert.equal(restored.cards('labor')[0].querySelector('[data-key="unitCost"]').value,'49.248');
  assert.equal(restored.cards('volume')[0].querySelector('[data-key="sourceEquipment"]').value,equipment.dataset.item);
  assert.equal(restored.cards('volume')[0].querySelector('[data-key="unitsPerPack"]').value,'152');
  assert.equal(restored.cards('miscellaneous')[0].querySelector('[data-key="unitCost"]').value,'');
  assert.equal(restored.actions.filter(action=>action!=='ping').length,0);
  assert.equal(restored.$('vm-success').hidden,true);assert.equal(restored.$('vm-download').disabled,true);
  assert.ok(restored.$('vm-draft-status').textContent.trim());
  restored.$('vm-add-equipment').click();restored.$('vm-add-labor').click();restored.$('vm-add-volume').click();restored.$('vm-add-miscellaneous').click();
  const ids=['equipment','labor','volume','miscellaneous'].flatMap(section=>restored.cards(section).map(card=>card.dataset.item));
  assert.equal(new Set(ids).size,ids.length,'Los nuevos registros no deben reutilizar identificadores.');
  assert.equal(restored.storage.getItem('contech-theme'),'dark');assert.equal(restored.storage.getItem('otra-herramienta'),'conservar');
});

test('un precio pendiente recuperado conserva el bloqueo y permite pasar a captura manual',async t=>{
  const first=await fixture(t),equipment=first.cards()[0];await first.query(equipment);
  assert.equal(first.draft().ui.equipment[equipment.dataset.item].pricePending,true);
  first.expand(equipment,false);const stored=first.snapshot();first.close();
  const restored=await fixture(t,{stored}),card=restored.cards()[0];
  assert.equal(restored.actions.filter(action=>action!=='ping').length,0);
  assert.equal(card.querySelector('.vm-manual-price').hidden,false);
  assert.equal(card.querySelector('.vm-lookup-choices').hidden,true,'No se deben recuperar opciones temporales del proveedor.');
  restored.$('vm-add-equipment').click();assert.equal(restored.cards().length,1);assert.equal(restored.$('vm-add-notice').hidden,false);assert.equal(card.querySelector('details').open,true);
  card.querySelector('.vm-manual-price').click();assert.equal(card.querySelector('[data-key="unitCost"]').value,'');
  assert.equal(restored.draft().ui.equipment[card.dataset.item].pricePending,false);
  restored.$('vm-add-equipment').click();assert.equal(restored.cards().length,2);
});

test('limpiar todo requiere confirmación y solo borra el borrador de la matriz',async t=>{
  const ui=await fixture(t,{stored:{'contech-theme':'dark','contech-propuesta-test':'otra propuesta'}}),equipment=ui.cards()[0];
  ui.input(ui.$('vm-client'),'Cliente por conservar');ui.input(ui.$('vm-project'),'Proyecto por conservar');ui.input(ui.$('vm-fee-pct'),'60');
  ui.fill(equipment,'concept','Equipo conservado');ui.openSection('volume');ui.fill(ui.cards('volume')[0],'concept','Material conservado');
  const before=ui.draft().state;
  ui.$('vm-clear-draft').click();const dialog=ui.$('vm-clear-dialog');assert.equal(dialog.open,true);
  assert.deepEqual(ui.draft().state,before);ui.$('vm-clear-cancel').click();assert.equal(dialog.open,false);assert.deepEqual(ui.draft().state,before);
  ui.$('vm-clear-draft').click();ui.escape(dialog);assert.equal(dialog.open,false);assert.deepEqual(ui.draft().state,before);assert.equal(ui.$('vm-client').value,'Cliente por conservar');
  ui.$('vm-clear-draft').click();ui.$('vm-clear-confirm').click();assert.equal(dialog.open,false);
  assert.equal(ui.storage.getItem(DRAFT_KEY),null);assert.equal(ui.storage.getItem('contech-theme'),'dark');assert.equal(ui.storage.getItem('contech-propuesta-test'),'otra propuesta');
  assert.equal(ui.$('vm-client').value,'');assert.equal(ui.$('vm-project').value,'');assert.equal(ui.cards().length,1);
  assert.equal(ui.cards()[0].querySelector('[data-key="concept"]').value,'');assert.equal(ui.cards()[0].querySelector('[data-key="unitCost"]').value,'');assert.equal(ui.cards()[0].querySelector('details').open,true);
  for(const [key,id] of Object.entries(settingsFields))assert.equal(ui.$(id).value,String(VM_DEFAULTS[key]));
  for(const section of ['labor','volume','miscellaneous']){assert.equal(ui.$('vm-enable-'+section),null);assert.equal(ui.$('vm-'+section+'-section').hidden,true);assert.equal(ui.cards(section).length,0);}
  assert.equal(ui.$('vm-data-section').hidden,false);assert.equal(ui.$('vm-tab-data').getAttribute('aria-selected'),'true');
  assert.equal(ui.$('vm-success').hidden,true);assert.equal(ui.$('vm-download').disabled,true);assert.equal(ui.actions.filter(action=>action!=='ping').length,0);
  // Clearing must not immediately repopulate storage with an empty draft.
  await ui.pause(30);assert.equal(ui.storage.getItem(DRAFT_KEY),null);
  ui.fill(ui.cards()[0],'concept','Nuevo equipo');assert.equal(ui.draft().state.equipment[0].concept,'Nuevo equipo');
});

test('los fallos de almacenamiento se informan y permiten continuar editando',async t=>{
  await t.test('sin espacio para guardar',async t=>{
    const ui=await fixture(t,{writeDenied:true}),equipment=ui.cards()[0];
    ui.input(ui.$('vm-client'),'Captura conservada en pantalla');ui.fill(equipment,'concept','Equipo editable');ui.$('vm-add-equipment').click();
    assert.equal(ui.$('vm-client').value,'Captura conservada en pantalla');assert.equal(equipment.querySelector('[data-key="concept"]').value,'Equipo editable');assert.equal(ui.cards().length,2);
    assert.match(ui.$('vm-draft-status').textContent,/no.*guard|no.*almacen|sin.*guard|no.*disponible|bloquead|espacio/i);
    assert.equal(ui.storage.getItem(DRAFT_KEY),null);
  });
  await t.test('acceso a localStorage bloqueado',async t=>{
    const ui=await fixture(t,{accessDenied:true});ui.input(ui.$('vm-project'),'Captura manual');ui.fill(ui.cards()[0],'concept','Equipo editable');
    assert.equal(ui.$('vm-project').value,'Captura manual');assert.equal(ui.cards()[0].querySelector('[data-key="concept"]').value,'Equipo editable');
    assert.match(ui.$('vm-draft-status').textContent,/no.*guard|no.*almacen|sin.*guard|no.*disponible|bloquead|acceso/i);
  });
});

test('el inicio vacío no crea un borrador por pings, eventos diferidos ni cierre de página',async t=>{
  const ui=await fixture(t,{stored:{'contech-theme':'dark'}});
  assert.equal(ui.storage.getItem(DRAFT_KEY),null);
  await ui.pause(30);assert.equal(ui.storage.getItem(DRAFT_KEY),null,'Un toggle inicial diferido no es una edición.');
  ui.expand(ui.cards()[0],true);assert.equal(ui.storage.getItem(DRAFT_KEY),null);
  const pingCount=ui.actions.filter(action=>action==='ping').length;
  ui.$('vm-syscom-refresh').click();await ui.waitFor(()=>ui.actions.filter(action=>action==='ping').length>pingCount);await ui.pause(30);
  assert.equal(ui.storage.getItem(DRAFT_KEY),null,'La comprobación de conexión no debe guardar un formulario sin cambios.');
  ui.win.dispatchEvent(new ui.win.Event('pagehide'));assert.equal(ui.storage.getItem(DRAFT_KEY),null);
  assert.equal(ui.$('vm-draft-status').classList.contains('warning'),false);assert.equal(ui.storage.getItem('contech-theme'),'dark');
});

test('un borrador inválido se conserva intacto hasta editar o confirmar su eliminación',async t=>{
  await t.test('una edición reemplaza el borrador inválido con los datos nuevos',async t=>{
    const raw='{borrador inválido sin cerrar',ui=await fixture(t,{stored:{[DRAFT_KEY]:raw,'contech-theme':'dark'}});
    await ui.pause(30);assert.equal(ui.storage.getItem(DRAFT_KEY),raw);assert.equal(ui.$('vm-draft-status').classList.contains('warning'),true);
    ui.$('vm-clear-draft').click();assert.equal(ui.storage.getItem(DRAFT_KEY),raw);ui.$('vm-clear-cancel').click();assert.equal(ui.storage.getItem(DRAFT_KEY),raw);
    ui.$('vm-syscom-refresh').click();await ui.pause(30);assert.equal(ui.storage.getItem(DRAFT_KEY),raw);
    ui.fill(ui.cards()[0],'concept','Datos de reemplazo');assert.equal(ui.draft().version,1);assert.equal(ui.draft().state.equipment[0].concept,'Datos de reemplazo');
    assert.equal(ui.storage.getItem('contech-theme'),'dark');
  });
  await t.test('limpiar con confirmación elimina una versión incompatible',async t=>{
    const raw=JSON.stringify({version:999,state:{client:'Datos incompatibles'}}),ui=await fixture(t,{stored:{[DRAFT_KEY]:raw}});
    await ui.pause(30);assert.equal(ui.storage.getItem(DRAFT_KEY),raw);
    ui.$('vm-clear-draft').click();assert.equal(ui.storage.getItem(DRAFT_KEY),raw);ui.$('vm-clear-confirm').click();
    await ui.pause(30);assert.equal(ui.storage.getItem(DRAFT_KEY),null);assert.equal(ui.cards().length,1);assert.equal(ui.$('vm-client').value,'');
  });
});

test('recuperar una matriz solo con mano de obra respeta la lista de equipos vacía',async t=>{
  const first=await fixture(t);first.input(first.$('vm-client'),'Tabachines');first.input(first.$('vm-project'),'Mantenimiento');
  first.cards()[0].querySelector('summary .icon-button').click();assert.equal(first.cards().length,0);
  first.openSection('labor');const labor=first.cards('labor')[0];first.fill(labor,'concept','Servicio de mantenimiento');first.fill(labor,'quantity','2');first.fill(labor,'unitCost','175.234567');
  const saved=first.draft(),stored=first.snapshot();assert.deepEqual(saved.state.equipment,[]);assert.equal(first.$('vm-download').disabled,false);first.close();
  const restored=await fixture(t,{stored});await restored.pause(30);
  assert.equal(restored.cards().length,0);assert.equal(restored.$('vm-equipment-list').querySelector('.vm-empty-list')!==null,true);
  assert.equal(restored.$('vm-collapse-equipment').disabled,true);assert.equal(restored.$('vm-expand-equipment').disabled,true);
  assert.equal(restored.$('vm-enable-labor'),null);assert.equal(restored.cards('labor').length,1);assert.equal(restored.cards('labor')[0].querySelector('[data-key="unitCost"]').value,'175.234567');
  assert.equal(restored.$('vm-download').disabled,false);assert.equal(restored.$('vm-item-count').textContent,'1');assert.deepEqual(restored.draft().state,saved.state);
  assert.equal(restored.actions.filter(action=>action!=='ping').length,0);assert.equal(restored.$('vm-success').hidden,true);
  restored.$('vm-add-equipment').click();assert.equal(restored.cards().length,1);assert.notEqual(restored.cards()[0].dataset.item,labor.dataset.item);
  assert.equal(restored.draft().state.labor.items[0].unitCost,'175.234567');
});

test('si removeItem falla, confirmar la limpieza conserva el formulario y avisa',async t=>{
  const ui=await fixture(t,{removeDenied:true,stored:{'contech-theme':'dark','otra-herramienta':'conservar'}});
  ui.input(ui.$('vm-client'),'Cliente conservado');ui.input(ui.$('vm-project'),'Proyecto conservado');ui.input(ui.$('vm-exchange-rate'),'18.987654321');
  ui.fill(ui.cards()[0],'concept','Equipo conservado');ui.fill(ui.cards()[0],'unitCost','100.123456');ui.openSection('miscellaneous');ui.fill(ui.cards('miscellaneous')[0],'concept','Consumible conservado');
  const saved=ui.storage.getItem(DRAFT_KEY);
  ui.$('vm-clear-draft').click();ui.$('vm-clear-confirm').click();assert.equal(ui.$('vm-clear-dialog').open,false);
  await ui.pause(30);assert.equal(ui.storage.getItem(DRAFT_KEY),saved);assert.equal(ui.$('vm-client').value,'Cliente conservado');assert.equal(ui.$('vm-project').value,'Proyecto conservado');
  assert.equal(ui.$('vm-exchange-rate').value,'18.987654321');assert.equal(ui.cards()[0].querySelector('[data-key="concept"]').value,'Equipo conservado');assert.equal(ui.cards()[0].querySelector('[data-key="unitCost"]').value,'100.123456');
  assert.equal(ui.$('vm-enable-miscellaneous'),null);assert.equal(ui.cards('miscellaneous')[0].querySelector('[data-key="concept"]').value,'Consumible conservado');
  assert.equal(ui.$('vm-draft-status').classList.contains('warning'),true);assert.match(ui.$('vm-draft-status').textContent,/no.*eliminar|no.*borrar/i);
  assert.equal(ui.storage.getItem('contech-theme'),'dark');assert.equal(ui.storage.getItem('otra-herramienta'),'conservar');
});

test('los borradores anteriores incluyen las partidas con datos aunque su casilla estaba desactivada',async t=>{
  const first=await fixture(t);first.input(first.$('vm-client'),'Tabachines');first.input(first.$('vm-project'),'Servicio');
  first.cards()[0].querySelector('summary .icon-button').click();first.openSection('labor');
  const labor=first.cards('labor')[0];first.fill(labor,'concept','Instalación conservada');first.fill(labor,'quantity','2');first.fill(labor,'unitCost','175.234567');
  const legacy=first.draft();legacy.state.labor.enabled=false;delete legacy.ui.activeTab;
  const stored=first.snapshot();stored[DRAFT_KEY]=JSON.stringify(legacy);first.close();
  const restored=await fixture(t,{stored});
  assert.equal(restored.$('vm-tab-data').getAttribute('aria-selected'),'true');assert.equal(restored.$('vm-labor-section').hidden,true);
  assert.equal(restored.$('vm-download').disabled,false);assert.equal(restored.$('vm-item-count').textContent,'1');
  restored.openSection('labor');assert.equal(restored.cards('labor')[0].querySelector('[data-key="unitCost"]').value,'175.234567');
  restored.input(restored.$('vm-project'),'Servicio actualizado');assert.equal(restored.draft().state.labor.enabled,true);
  assert.equal(restored.actions.filter(action=>action!=='ping').length,0);
});
