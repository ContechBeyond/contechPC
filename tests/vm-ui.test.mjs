import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const bridge=await readFile(new URL('../extensions/contech-syscom/app-bridge.js',import.meta.url),'utf8');
let fixtureId=0;

async function fixture(t){
  const dom=new JSDOM(html,{url:'https://contech-test.onrender.com/',runScripts:'outside-only'}),win=dom.window;
  const previous={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout,setInterval:globalThis.setInterval};
  const timers=new Set(),intervals=new Set();
  Object.assign(globalThis,{window:win,document:win.document});
  globalThis.setTimeout=(callback,delay,...args)=>{const handle=previous.setTimeout(callback,delay,...args);handle.unref?.();timers.add(handle);return handle;};
  globalThis.setInterval=(callback,delay,...args)=>{const handle=previous.setInterval(callback,delay,...args);handle.unref?.();intervals.add(handle);return handle;};
  t.after(()=>{
    for(const timer of timers)clearTimeout(timer);
    for(const interval of intervals)clearInterval(interval);
    dom.window.close();Object.assign(globalThis,previous);
  });
  // The interaction must remain non-blocking; native confirmation/alert dialogs
  // would prevent users from continuing to correct a pending price.
  win.confirm=()=>{assert.fail('No debe abrir un diálogo de confirmación.');};
  win.alert=()=>{assert.fail('No debe abrir un diálogo de alerta.');};
  const product={model:'CAM-001',concept:'Cámara',description:'Cámara exterior de prueba.',brand:'Marca de prueba',supplier:'SYSCOM',url:'https://www.syscom.mx/products/1',price:{unitCost:1175.18,currency:'USD',withIVA:false},priceChoices:[],loginRequired:false};
  let mode='priced',finishSearch;
  win.postMessage=(data,origin)=>{
    assert.equal(origin,win.location.origin);
    setImmediate(()=>{if(!win.closed)win.dispatchEvent(new win.MessageEvent('message',{data,origin,source:win}));});
  };
  win.chrome={runtime:{async sendMessage(message){
    if(message.action==='ping')return {ok:true,data:{paused:null,retryAfter:0}};
    if(message.action==='cancel'){
      finishSearch?.({ok:false,error:{code:'cancelled',message:'Consulta cancelada.'}});
      return {ok:true,data:{cancelled:true}};
    }
    if(message.action==='search'){
      if(mode==='slow')return await new Promise(resolve=>{finishSearch=resolve;});
      const selected=structuredClone(product);
      if(mode==='pending'){
        selected.price=null;
        selected.priceChoices=[{unitCost:99.99,currency:'USD',withIVA:false,label:'Precio de compra'}];
      }
      if(mode==='login'){selected.price=null;selected.loginRequired=true;}
      return {ok:true,data:{kind:'product',product:selected}};
    }
    throw new Error('Acción inesperada: '+message.action);
  }}};
  win.eval(bridge);
  const moduleUrl=new URL('../vm-ui.js',import.meta.url);moduleUrl.searchParams.set('test',String(++fixtureId));
  const {initMatrixBuilder}=await import(moduleUrl.href);initMatrixBuilder();
  const $=id=>win.document.getElementById(id);
  const cards=()=>[...$('vm-equipment-list').querySelectorAll('.vm-equipment-item')];
  function fill(card,key,value){const control=card.querySelector('[data-key="'+key+'"]');control.value=value;control.dispatchEvent(new win.Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));}
  async function waitFor(check){
    for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>previous.setTimeout(resolve,10));}
    assert.fail('No llegó el estado esperado.');
  }
  async function query(card,selectedMode){
    mode=selectedMode;fill(card,'model','CAM-001');
    await waitFor(()=>!card.querySelector('.vm-lookup-button').disabled);
    card.querySelector('.vm-lookup-button').click();
    if(selectedMode==='slow')await waitFor(()=>Boolean(finishSearch));
    else await waitFor(()=>!card.querySelector('.vm-lookup-button').disabled&&card.querySelector('[data-key="concept"]').value==='Cámara');
  }
  await waitFor(()=>$('vm-syscom-status').textContent.includes('Extensión conectada'));
  return {$,cards,fill,query,waitFor,win,resolveSearch:()=>finishSearch?.({ok:true,data:{kind:'product',product:structuredClone(product)}})};
}

test('agregar equipos conserva los datos y distingue precios pendientes de captura manual',async t=>{
  // Fixtures share the browser globals used by the real module, so run these
  // interactions sequentially and restore every timer and DOM afterwards.
  await t.test('alta manual con precio vacío colapsa el anterior y abre el nuevo',async t=>{
    const ui=await fixture(t),first=ui.cards()[0];
    ui.fill(first,'concept','Equipo capturado manualmente');ui.fill(first,'description','Descripción conservada');
    assert.equal(first.querySelector('[data-key="unitCost"]').value,'');
    ui.$('vm-add-equipment').click();
    assert.equal(ui.cards().length,2);
    assert.equal(first.querySelector('details').open,false);
    assert.equal(ui.cards()[1].querySelector('details').open,true);
    assert.equal(first.querySelector('.vm-equipment-title').textContent,'Equipo capturado manualmente');
    assert.equal(first.querySelector('[data-key="description"]').value,'Descripción conservada');
    assert.equal(first.querySelector('[data-key="unitCost"]').value,'');
    assert.equal(ui.$('vm-add-notice').hidden,true);
  });

  await t.test('precio principal cargado desde SYSCOM permite el alta y conserva su importe',async t=>{
    const ui=await fixture(t),first=ui.cards()[0];
    await ui.query(first,'priced');ui.$('vm-add-equipment').click();
    assert.equal(ui.cards().length,2);
    assert.equal(first.querySelector('details').open,false);
    assert.equal(first.querySelector('[data-key="unitCost"]').value,'1175.18');
    assert.equal(first.querySelector('[data-key="currency"]').value,'USD');
  });

  await t.test('precio pendiente impide el alta y muestra aviso y resaltado, sin confirmación',async t=>{
    const ui=await fixture(t),first=ui.cards()[0];
    await ui.query(first,'pending');first.querySelector('details').open=false;
    ui.$('vm-add-equipment').click();
    assert.equal(ui.cards().length,1);
    assert.equal(first.querySelector('details').open,true);
    assert.equal(ui.$('vm-add-notice').hidden,false);
    assert.match(ui.$('vm-add-notice').textContent,/precio/i);
    assert.equal(first.classList.contains('vm-item-attention'),true);
    first.querySelector('.vm-product-choice').click();ui.$('vm-add-equipment').click();
    assert.equal(ui.cards().length,2);
    assert.equal(first.querySelector('[data-key="unitCost"]').value,'99.99');
    assert.equal(first.querySelector('details').open,false);
  });

  await t.test('captura manual explícita permite dejar el precio vacío tras consultar SYSCOM',async t=>{
    const ui=await fixture(t),first=ui.cards()[0];
    await ui.query(first,'login');
    const manual=first.querySelector('.vm-manual-price');assert.ok(manual);assert.equal(manual.hidden,false);
    manual.click();assert.equal(first.querySelector('[data-key="unitCost"]').value,'');
    ui.$('vm-add-equipment').click();assert.equal(ui.cards().length,2);
    assert.equal(first.querySelector('details').open,false);
  });

  await t.test('capturar el precio manualmente resuelve la selección pendiente',async t=>{
    const ui=await fixture(t),first=ui.cards()[0];
    await ui.query(first,'pending');ui.fill(first,'unitCost','150.25');
    ui.$('vm-add-equipment').click();assert.equal(ui.cards().length,2);
    assert.equal(first.querySelector('[data-key="unitCost"]').value,'150.25');
  });

  await t.test('revisa equipos anteriores con precio pendiente aunque haya otra tarjeta al final',async t=>{
    const ui=await fixture(t),first=ui.cards()[0];
    await ui.query(first,'priced');ui.$('vm-add-equipment').click();const second=ui.cards()[1];
    ui.fill(second,'concept','Equipo manual');first.querySelector('details').open=true;
    await ui.query(first,'pending');first.querySelector('details').open=false;
    ui.$('vm-add-equipment').click();assert.equal(ui.cards().length,2);
    assert.equal(first.querySelector('details').open,true);
    assert.equal(second.querySelector('details').open,true);
    assert.equal(first.classList.contains('vm-item-attention'),true);
  });

  await t.test('consulta en curso impide agregar hasta que regrese el precio',async t=>{
    const ui=await fixture(t),first=ui.cards()[0];
    await ui.query(first,'slow');ui.$('vm-add-equipment').click();
    assert.equal(ui.cards().length,1);
    assert.equal(ui.$('vm-add-notice').hidden,false);
    assert.equal(first.classList.contains('vm-item-attention'),true);
    ui.resolveSearch();await ui.waitFor(()=>first.querySelector('[data-key="unitCost"]').value==='1175.18'&&!first.querySelector('.vm-lookup-button').disabled);
    ui.$('vm-add-equipment').click();assert.equal(ui.cards().length,2);
    assert.equal(first.querySelector('details').open,false);
  });
});
