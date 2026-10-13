import test from 'node:test';
import assert from 'node:assert/strict';
import {VM_DEFAULTS} from '../vm-core.js';
import {MATRIX_DRAFT_KEY,createBlankMatrixState,readMatrixDraft,writeMatrixDraft,removeMatrixDraft} from '../vm-draft.js';

function memoryStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {values,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
const row=(id,fields={})=>({id,concept:'',description:'',quantity:'',unitCost:'',unitsPerPack:'',model:'',brand:'',supplier:'',currency:'USD',unit:'m',sourceEquipment:'',...fields});
function incompleteState(){
  const state=createBlankMatrixState();
  state.client=' Tabachines ';state.project='Videoportero';
  state.settings={exchangeRate:'19,123456789',indirectPct:'21,',feePct:'',commissionPct:'5.0000',provisionPct:'3',rounding:'unit-rounded'};
  state.equipment=[row('equipment-1',{concept:'Kit',description:' Primera línea\nSegunda línea ',quantity:'2,',unitCost:'001.234,567890',model:'DS-KIS608-P',supplier:'SYSCOM'}),row('equipment-2',{concept:'Cable',quantity:'',unitCost:'0',currency:'MXN'})];
  state.labor={enabled:true,items:[row('labor-3',{concept:'Instalación',quantity:'-',unitCost:'pendiente'})]};
  state.volume={enabled:true,items:[row('volume-4',{concept:'Cableado',sourceEquipment:'equipment-2',unitsPerPack:'152',quantity:'25,125'})]};
  state.miscellaneous={enabled:false,items:[row('miscellaneous-5',{concept:'Consumibles',description:'Datos conservados al desactivar la sección',quantity:'3',unitCost:'5.125'})]};
  return state;
}

test('restaura un borrador incompleto, decimales exactos, secciones desactivadas y vínculos',()=>{
  const storage=memoryStorage(),state=incompleteState(),ui={activeTab:'volume',equipment:{'equipment-1':{open:false,pricePending:true},'equipment-2':{open:true,pricePending:false}}};
  const written=writeMatrixDraft(storage,state,ui);assert.equal(written.ok,true);
  const restored=readMatrixDraft(storage);assert.equal(restored.status,'restored');
  assert.deepEqual(restored.draft.state,state);assert.deepEqual(restored.draft.ui,ui);assert.equal(restored.draft.savedAt,written.savedAt);
  assert.equal(JSON.parse(storage.values.get(MATRIX_DRAFT_KEY)).version,1);
});

test('los defaults se reconstruyen en objetos separados sin exigir una matriz válida',()=>{
  const blank=createBlankMatrixState(),other=createBlankMatrixState();
  assert.deepEqual(blank.settings,VM_DEFAULTS);blank.settings.exchangeRate=1;blank.labor.items.push(row('labor-1'));
  assert.equal(other.settings.exchangeRate,19);assert.equal(other.labor.items.length,0);
  const storage=memoryStorage();assert.equal(readMatrixDraft(storage).status,'empty');
  assert.equal(writeMatrixDraft(storage,{equipment:[{id:'equipment-1'}]}).ok,true);
  const restored=readMatrixDraft(storage).draft;
  assert.equal(restored.state.equipment[0].quantity,'');assert.equal(restored.state.equipment[0].concept,'');
  assert.equal(restored.state.equipment[0].currency,'USD');assert.equal(restored.state.equipment[0].unit,'m');
  assert.deepEqual(restored.state.settings,VM_DEFAULTS);
  assert.deepEqual(restored.ui.equipment['equipment-1'],{open:true,pricePending:false});
  assert.equal(restored.ui.activeTab,'data');
});

test('solo persiste campos autorizados, sin tokens, trabajos ni datos de sesión',()=>{
  const storage=memoryStorage(),state=incompleteState();
  state.sessionToken='secret';state.equipment[0].product={url:'https://example.com',token:'secret'};state.settings.token='secret';
  const ui={equipment:{'equipment-1':{open:false,pricePending:true,token:'secret'}},lookupCurrent:{token:'secret'}};
  assert.equal(writeMatrixDraft(storage,state,ui).ok,true);
  const raw=storage.values.get(MATRIX_DRAFT_KEY);assert.equal(raw.includes('secret'),false);assert.equal(raw.includes('lookupCurrent'),false);
  assert.equal(readMatrixDraft(storage).status,'restored');
});

test('JSON corrupto, versiones ajenas y fechas inválidas no se modifican ni se eliminan',()=>{
  const state=createBlankMatrixState();
  for(const raw of ['{',JSON.stringify({version:2,state,savedAt:new Date().toISOString()}),JSON.stringify({version:1,state,savedAt:'2026-02-30T00:00:00.000Z'}),JSON.stringify({version:1,state:null,savedAt:new Date().toISOString()})]){
    const storage=memoryStorage({[MATRIX_DRAFT_KEY]:raw});assert.equal(readMatrixDraft(storage).status,'invalid');assert.equal(storage.values.get(MATRIX_DRAFT_KEY),raw);
  }
});

test('rechaza tipos, enumeraciones y límites corruptos sin truncar ni sobrescribir',()=>{
  const mutations=[
    state=>state.client='x'.repeat(91),state=>state.project=[],state=>state.settings.feePct=true,
    state=>state.settings.rounding='other',state=>state.settings.exchangeRate='1'.repeat(129),
    state=>state.equipment[0].description='x'.repeat(1201),state=>state.miscellaneous.items[0].description='x'.repeat(601),
    state=>state.equipment[0].quantity='1'.repeat(31),state=>state.equipment[0].unitCost=Infinity,
    state=>state.equipment[0].currency='EUR',state=>state.equipment[0].model={},state=>state.labor.enabled='true',
    state=>state.volume.items='rows',state=>state.equipment=new Array(1),state=>state.equipment=Array.from({length:201},(_,index)=>row(`equipment-${index+1}`))
  ];
  for(const mutate of mutations){
    const storage=memoryStorage({[MATRIX_DRAFT_KEY]:'previous'}),state=incompleteState();mutate(state);
    const result=writeMatrixDraft(storage,state);assert.equal(result.ok,false);assert.ok(result.error instanceof Error);assert.equal(storage.values.get(MATRIX_DRAFT_KEY),'previous');
  }
});

test('los IDs deben pertenecer a su sección y ser únicos; conserva un enlace eliminado',()=>{
  for(const id of ['equipment-0','equipment-01','equipment--1','equipment-9007199254740992','labor-1','__proto__']){
    const state=incompleteState();state.equipment[0].id=id;assert.equal(writeMatrixDraft(memoryStorage(),state).ok,false);
  }
  const state=incompleteState();state.equipment[1].id=state.equipment[0].id;assert.equal(writeMatrixDraft(memoryStorage(),state).ok,false);
  state.equipment[1].id='equipment-2';state.volume.items[0].sourceEquipment='equipment-99';
  const storage=memoryStorage();assert.equal(writeMatrixDraft(storage,state).ok,true);
  assert.equal(readMatrixDraft(storage).draft.state.volume.items[0].sourceEquipment,'equipment-99');
  assert.equal(writeMatrixDraft(storage,state,{equipment:{'equipment-99':{open:true}}}).ok,false);
  assert.equal(writeMatrixDraft(storage,state,{equipment:{'equipment-1':{open:'false'}}}).ok,false);
  state.volume.items[0].sourceEquipment='not-an-id';assert.equal(writeMatrixDraft(storage,state).ok,false);
});

test('admite valores numéricos finitos y conserva cero, negativos y texto sin completar',()=>{
  const state=incompleteState(),storage=memoryStorage();state.settings.exchangeRate=0;state.equipment[0].quantity=-2;state.equipment[0].unitCost=123.4567890123;
  assert.equal(writeMatrixDraft(storage,state).ok,true);assert.deepEqual(readMatrixDraft(storage).draft.state,state);
});

test('errores o ausencia de storage retornan estado sin tirar excepciones',()=>{
  const error=new Error('Storage bloqueado'),storage={getItem(){throw error;},setItem(){throw error;},removeItem(){throw error;}};
  assert.deepEqual(readMatrixDraft(storage),{status:'unavailable',error});
  assert.deepEqual(writeMatrixDraft(storage,createBlankMatrixState()),{ok:false,error});
  assert.deepEqual(removeMatrixDraft(storage),{ok:false,error});
  assert.equal(readMatrixDraft(null).status,'unavailable');assert.equal(writeMatrixDraft(null,createBlankMatrixState()).ok,false);assert.equal(removeMatrixDraft(null).ok,false);
});

test('limpiar elimina solo la clave de la matriz y conserva tema y otras herramientas',()=>{
  const storage=memoryStorage({[MATRIX_DRAFT_KEY]:'draft','contech-theme':'dark','other-tool':'keep'});
  assert.deepEqual(removeMatrixDraft(storage),{ok:true});assert.equal(readMatrixDraft(storage).status,'empty');
  assert.equal(storage.values.get('contech-theme'),'dark');assert.equal(storage.values.get('other-tool'),'keep');
  assert.deepEqual(removeMatrixDraft(storage),{ok:true});
});
