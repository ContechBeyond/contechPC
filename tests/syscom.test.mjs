import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../extensions/contech-syscom/background.js';
import {POLICY,appOrigin,productURL,rateStatus,normalizeModel} from '../extensions/contech-syscom/shared.js';
const app='https://contech-test.onrender.com',sender={id:'extension-test',url:app+'/#/crear-matriz',frameId:0,tab:{id:10}},popup={id:'extension-test',url:'chrome-extension://extension-test/popup.html'};
const candidate={model:'CAM-001',title:'Cámara de prueba',brand:'Marca',url:'https://www.syscom.mx/products/1'};
const product={model:'CAM-001',concept:'Cámara',description:'Descripción de prueba',brand:'Marca',supplier:'SYSCOM',url:candidate.url,price:{unitCost:123.45,currency:'USD',withIVA:false},priceChoices:[]};
function harness(){
  let clock=1700000000000,nextTab=100,readSearch=()=>({candidates:[candidate]}),readProduct=()=>({product});
  const events=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:(...args)=>{for(const fn of listeners)fn(...args);}};};
  const local={origins:[app]},session={},tabs=new Map(),navigation=[];
  const store=data=>({async get(keys){return Object.fromEntries(keys.filter(key=>key in data).map(key=>[key,structuredClone(data[key])]));},async set(values){Object.assign(data,structuredClone(values));},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}});
  const api={runtime:{id:'extension-test',getURL:path=>'chrome-extension://extension-test/'+path},storage:{local:store(local),session:store(session)},permissions:{contains:async()=>true},scripting:{executeScript:async()=>{},unregisterContentScripts:async()=>{},registerContentScripts:async()=>{}},tabs:{onUpdated:events(),onRemoved:events(),async get(id){if(!tabs.has(id))throw Error('Tab closed');return {...tabs.get(id)};},async create(options){const tab={id:nextTab++,status:'complete',...options};tabs.set(tab.id,tab);navigation.push(tab.url);return {...tab};},async update(id,options){if(!tabs.has(id))throw Error('Tab closed');const tab={...tabs.get(id),...options};tabs.set(id,tab);if(options.url)navigation.push(options.url);return {...tab};},async remove(id){tabs.delete(id);api.tabs.onRemoved.emit(id);},async sendMessage(id,message){assert.ok(tabs.has(id));return message.kind==='search'?await readSearch():await readProduct();}}};
  const controller=createController(api,{now:()=>clock,wait:async ms=>{clock+=ms;}});
  return {controller,api,local,session,tabs,navigation,advance:ms=>{clock+=ms;},now:()=>clock,search:value=>{readSearch=value;},detail:value=>{readProduct=value;}};
}
test('autoriza solo las apps conectadas y enlaces de producto de SYSCOM',async()=>{
  assert.equal(appOrigin(app+'/#/crear-matriz'),app);assert.equal(appOrigin('http://127.0.0.1:4180/'),'http://127.0.0.1:4180');
  for(const url of ['https://evil.com/','https://contech-test.onrender.com.evil.com/','file:///secret','https://user:password@contech-test.onrender.com/'])assert.throws(()=>appOrigin(url));
  assert.equal(productURL(candidate.url+'?anything=1'),candidate.url);assert.equal(productURL('https://www.syscom.mx.evil.com/products/1'),null);assert.equal(productURL('https://www.syscom.mx/panel/mis_facturas'),null);
  assert.equal(normalizeModel(' cam-001 '),'CAM-001');
  const h=harness();const denied=await h.controller.handle({action:'search',model:'CAM-001'},{...sender,url:'https://evil.com/'});assert.equal(denied.error.code,'not-connected');assert.equal(h.navigation.length,0);
  assert.equal((await h.controller.handle({action:'search',model:'CAM-001'},{...sender,frameId:1})).ok,false);
});
test('consulta una coincidencia exacta, conserva el precio y no guarda datos privados',async()=>{
  const h=harness(),result=await h.controller.handle({action:'search',model:'CAM-001'},sender);
  assert.equal(result.ok,true);assert.equal(result.data.kind,'product');assert.equal(result.data.product.price.unitCost,123.45);
  assert.deepEqual(h.navigation,['https://www.syscom.mx/products?query=CAM-001',candidate.url]);
  assert.ok(!JSON.stringify(h.local).includes('123.45'));assert.ok(!JSON.stringify(h.session).includes('123.45'));assert.equal(h.session.lock,undefined);
  const blocked=await h.controller.handle({action:'search',model:'CAM-001'},sender);assert.equal(blocked.error.code,'rate');assert.equal(h.navigation.length,2);
  h.advance(POLICY.interval);assert.equal((await h.controller.handle({action:'search',model:'CAM-001'},sender)).ok,true);
});
test('ofrece variantes y valida quién puede seleccionar un resultado',async()=>{
  const h=harness();h.search(()=>({candidates:[candidate,{...candidate,model:'CAM-002',url:'https://www.syscom.mx/products/2'}]}));
  const result=await h.controller.handle({action:'search',model:'CAM'},sender);assert.equal(result.data.kind,'candidates');assert.equal(h.navigation.length,1);
  const stolen=await h.controller.handle({action:'select',token:result.data.token,index:0},{...sender,tab:{id:11}});assert.equal(stolen.error.code,'expired');
  const chosen=await h.controller.handle({action:'select',token:result.data.token,index:0},sender);assert.equal(chosen.ok,true);assert.equal(chosen.data.product.model,'CAM-001');assert.equal(h.session.pending[result.data.token],undefined);
});
test('un bloqueo pausa las consultas y solo la extensión puede reanudarlas',async()=>{
  const h=harness();h.search(()=>({error:{code:'blocked',message:'Verificación de seguridad.'}}));
  const result=await h.controller.handle({action:'search',model:'CAM-001'},sender);assert.equal(result.error.code,'blocked');assert.equal(h.navigation.length,1);assert.equal(h.local.paused,'Verificación de seguridad.');
  h.advance(POLICY.interval);assert.equal((await h.controller.handle({action:'search',model:'CAM-001'},sender)).error.code,'paused');assert.equal(h.navigation.length,1);
  assert.equal((await h.controller.handle({action:'resume'},sender)).ok,false);assert.equal((await h.controller.handle({action:'resume'},popup)).ok,true);
  h.search(()=>({candidates:[candidate]}));assert.equal((await h.controller.handle({action:'search',model:'CAM-001'},sender)).ok,true);
});
test('solo admite una consulta en curso y cancelar no abre la ficha',async()=>{
  const h=harness();let finish;h.search(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=h.controller.handle({action:'search',model:'CAM-001'},sender);
  for(let i=0;i<30&&!finish;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(finish);
  const second=await h.controller.handle({action:'search',model:'CAM-002'},sender);assert.equal(second.error.code,'busy');
  await h.controller.handle({action:'cancel'},sender);finish({candidates:[candidate]});const result=await pending;assert.equal(result.error.code,'cancelled');assert.equal(h.navigation.length,1);assert.equal(h.tabs.size,0);
});
test('rechaza fichas de otro modelo y respeta el límite por hora tras reiniciar el controlador',async()=>{
  const h=harness();h.detail(()=>({product:{...product,model:'OTRO'}}));assert.equal((await h.controller.handle({action:'search',model:'CAM-001'},sender)).error.code,'model');
  const history=Array.from({length:POLICY.hourLimit},(_,i)=>h.now()-100000+i*1000);const rate=rateStatus(history,h.now()-30000,h.now());assert.ok(rate.retryAfter>0);assert.equal(rate.remaining,0);
  h.local.rate={history,last:h.now()-30000};const restarted=createController(h.api,{now:h.now,wait:async()=>{}});const result=await restarted.handle({action:'search',model:'CAM-001'},sender);assert.equal(result.error.code,'rate');assert.equal(h.navigation.length,2);
});
test('configurar exige permisos concedidos y registra únicamente los orígenes autorizados',async()=>{
  const h=harness();let registered;
  h.local.origins.push('https://revocado.onrender.com');
  h.api.permissions.contains=async({origins})=>!origins.some(origin=>origin.includes('revocado'));
  h.api.scripting.registerContentScripts=async scripts=>{registered=scripts;};
  const result=await h.controller.handle({action:'configure',url:app},popup);assert.equal(result.ok,true);assert.deepEqual(h.local.origins,[app]);
  assert.ok(registered.some(script=>script.id==='contech-syscom-reader'));assert.ok(registered.some(script=>script.matches.includes(app+'/*')));assert.ok(registered.every(script=>!script.matches.includes('<all_urls>')));
  h.api.permissions.contains=async()=>false;assert.equal((await h.controller.handle({action:'configure',url:app},popup)).error.code,'permissions');
  assert.equal((await h.controller.handle({action:'configure',url:app},sender)).ok,false);
});
test('no reutiliza una pestaña repuesta a cuenta o carrito y rechaza cambios de página durante la lectura',async()=>{
  const h=harness();await h.controller.handle({action:'search',model:'CAM-001'},sender);const previous=h.session.readerTab;h.tabs.get(previous).url='https://www.syscom.mx/panel/mi_cuenta';h.advance(POLICY.interval);
  assert.equal((await h.controller.handle({action:'search',model:'CAM-001'},sender)).ok,true);assert.notEqual(h.session.readerTab,previous);assert.equal(h.tabs.get(previous).url,'https://www.syscom.mx/panel/mi_cuenta');
  h.advance(POLICY.interval);h.detail(()=>{h.tabs.get(h.session.readerTab).url='https://www.syscom.mx/carrito';return {product};});
  assert.equal((await h.controller.handle({action:'search',model:'CAM-001'},sender)).error.code,'changed');
});
