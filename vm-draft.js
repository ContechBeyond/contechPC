import {VM_DEFAULTS,VM_MAX_ITEMS} from './vm-core.js';

export const MATRIX_DRAFT_KEY='contech-matrix-draft';
const DRAFT_VERSION=1,MAX_JSON_LENGTH=2*1024*1024;
const SECTIONS=['equipment','labor','volume','miscellaneous'];
const NUMERIC_FIELDS=['quantity','unitCost','unitsPerPack'];
const SETTINGS_FIELDS=['exchangeRate','indirectPct','feePct','commissionPct','provisionPct'];
const TABS=['data',...SECTIONS];
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const invalid=message=>{throw new Error(message);};

export function createBlankMatrixState(){
  return {client:'',project:'',settings:{...VM_DEFAULTS},equipment:[],labor:{enabled:false,items:[]},volume:{enabled:false,items:[]},miscellaneous:{enabled:false,items:[]}};
}

function stringField(object,key,max,fallback=''){
  if(!own(object,key))return fallback;
  const value=object[key];
  if(typeof value!=='string'||value.length>max)invalid(`El campo ${key} del borrador no es válido.`);
  return value;
}
function numericField(object,key,max,fallback=''){
  if(!own(object,key))return fallback;
  const value=object[key];
  // A draft may contain an unfinished or currently invalid numeric input.
  if(typeof value==='string'&&value.length<=max)return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  return invalid(`El campo ${key} del borrador no es válido.`);
}
function choiceField(object,key,choices,fallback){
  const value=stringField(object,key,100,fallback);
  if(!choices.includes(value))invalid(`El campo ${key} del borrador no es válido.`);
  return value;
}
function booleanField(object,key,fallback){
  if(!own(object,key))return fallback;
  if(typeof object[key]!=='boolean')invalid(`El campo ${key} del borrador no es válido.`);
  return object[key];
}
function itemId(value,section){
  if(typeof value!=='string'||value.length>40||!new RegExp(`^${section}-[1-9]\\d*$`).test(value)||!Number.isSafeInteger(Number(value.slice(section.length+1))))invalid('Un identificador de partida del borrador no es válido.');
  return value;
}
function cleanItem(input,section,ids){
  if(!record(input))invalid('Una partida del borrador no es válida.');
  const id=itemId(input.id,section);
  if(ids.has(id))invalid('El borrador contiene identificadores de partida repetidos.');
  ids.add(id);
  const item={id,concept:stringField(input,'concept',180),description:stringField(input,'description',section==='miscellaneous'?600:1200)};
  for(const key of NUMERIC_FIELDS)item[key]=numericField(input,key,30);
  for(const key of ['model','brand','supplier'])item[key]=stringField(input,key,100);
  item.currency=choiceField(input,'currency',['USD','MXN'],'USD');
  item.unit=stringField(input,'unit',20,'m');
  item.sourceEquipment=stringField(input,'sourceEquipment',40);
  // A deleted equipment link is preserved so the user can repair it after reload.
  if(item.sourceEquipment)itemId(item.sourceEquipment,'equipment');
  return item;
}
function cleanItems(input,section,ids){
  if(!Array.isArray(input)||input.length>VM_MAX_ITEMS)invalid(`La sección ${section} del borrador no es válida.`);
  return Array.from(input,item=>cleanItem(item,section,ids));
}
function cleanState(input){
  if(!record(input))invalid('Los datos de la matriz del borrador no son válidos.');
  const state=createBlankMatrixState(),ids=new Set();
  state.client=stringField(input,'client',90);state.project=stringField(input,'project',90);
  const settings=own(input,'settings')?input.settings:{};
  if(!record(settings))invalid('La configuración del borrador no es válida.');
  for(const key of SETTINGS_FIELDS)state.settings[key]=numericField(settings,key,128,VM_DEFAULTS[key]);
  state.settings.rounding=choiceField(settings,'rounding',['precision','unit-rounded'],VM_DEFAULTS.rounding);
  state.equipment=cleanItems(own(input,'equipment')?input.equipment:[],'equipment',ids);
  for(const section of SECTIONS.slice(1)){
    const source=own(input,section)?input[section]:{};
    if(!record(source))invalid(`La sección ${section} del borrador no es válida.`);
    state[section]={enabled:booleanField(source,'enabled',false),items:cleanItems(own(source,'items')?source.items:[],section,ids)};
  }
  return state;
}
function cleanUi(input,state){
  if(input===undefined)input={};
  if(!record(input))invalid('La presentación del borrador no es válida.');
  const source=own(input,'equipment')?input.equipment:{};
  if(!record(source))invalid('La presentación de equipos del borrador no es válida.');
  const ids=new Set(state.equipment.map(item=>item.id)),equipment={};
  for(const id of Object.keys(source))if(!ids.has(id))invalid('La presentación del borrador contiene un equipo desconocido.');
  for(const id of ids){
    const settings=own(source,id)?source[id]:{};
    if(!record(settings))invalid('La presentación de un equipo del borrador no es válida.');
    equipment[id]={open:booleanField(settings,'open',true),pricePending:booleanField(settings,'pricePending',false)};
  }
  return {activeTab:choiceField(input,'activeTab',TABS,'data'),equipment};
}
function cleanDraft(input){
  if(!record(input)||input.version!==DRAFT_VERSION)invalid('La versión o estructura del borrador no es compatible.');
  if(typeof input.savedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.savedAt)||!Number.isFinite(Date.parse(input.savedAt))||new Date(input.savedAt).toISOString()!==input.savedAt)invalid('La fecha del borrador no es válida.');
  const state=cleanState(input.state);
  return {state,ui:cleanUi(input.ui,state),savedAt:input.savedAt};
}

export function readMatrixDraft(storage){
  let raw;
  try{raw=storage.getItem(MATRIX_DRAFT_KEY);}catch(error){return {status:'unavailable',error};}
  if(raw===null)return {status:'empty'};
  try{
    if(typeof raw!=='string'||raw.length>MAX_JSON_LENGTH)invalid('El borrador guardado supera el tamaño admitido o no es válido.');
    return {status:'restored',draft:cleanDraft(JSON.parse(raw))};
  }catch(error){return {status:'invalid',error};}
}

export function writeMatrixDraft(storage,input,ui){
  try{
    const state=cleanState(input),savedAt=new Date().toISOString();
    const raw=JSON.stringify({version:DRAFT_VERSION,state,ui:cleanUi(ui,state),savedAt});
    if(raw.length>MAX_JSON_LENGTH)invalid('El borrador supera el tamaño admitido.');
    storage.setItem(MATRIX_DRAFT_KEY,raw);
    return {ok:true,savedAt};
  }catch(error){return {ok:false,error};}
}

export function removeMatrixDraft(storage){
  try{storage.removeItem(MATRIX_DRAFT_KEY);return {ok:true};}
  catch(error){return {ok:false,error};}
}
