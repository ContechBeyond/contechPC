import test from 'node:test';
import assert from 'node:assert/strict';
import {VM_DEFAULTS,calculateMatrix,validateMatrix,cableAmounts,suggestCableCapacity} from '../vm-core.js';
import {readMatrixDraft,writeMatrixDraft} from '../vm-draft.js';

const data=()=>({client:'Tabachines',project:'Cableado',settings:{...VM_DEFAULTS},equipment:[{id:'equipment-1',concept:'Cable Cat6',description:'Cable exterior',quantity:'1',unitCost:'3050',currency:'MXN',cableEnabled:true,cableMode:'meter',metersPerReel:'305',cableMeters:'75',cableReels:''}],labor:{items:[{id:'labor-2',concept:'Instalación de cableado',quantity:'999',unitCost:'25',cableEquipment:'equipment-1'}]},volume:{items:[]},miscellaneous:{items:[]}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('cobra metros o bobinas e instala solo los metros usados, sin duplicar compras',()=>{
  const input=data(),before=JSON.stringify(input);let result=calculateMatrix(input);
  assert.equal(result.entries[0].quantity,75);assert.equal(result.entries[0].mxnCost,10);
  assert.equal(result.entries[0].direct,750);assert.equal(result.laborDirect,1875);assert.equal(result.totals.direct,2625);
  assert.equal(JSON.stringify(input),before,'Los cálculos no modifican los datos originales.');
  input.equipment[0].cableMode='reel';result=calculateMatrix(input);
  assert.equal(result.entries[0].quantity,1);assert.equal(result.entries[0].direct,3050);assert.equal(result.laborDirect,1875);
  input.equipment[0].cableMeters='400';result=calculateMatrix(input);
  assert.equal(result.entries[0].quantity,2);assert.equal(result.totals.direct,6100+10000);
  input.equipment[0].cableReels='1';assert.equal(calculateMatrix(input).entries[0].direct,3050);
  input.equipment[0].cableReels='';assert.equal(calculateMatrix(input).entries[0].quantity,2);
});

test('conserva precisión, moneda, ajustes de instalación y volumetría sin dividir dos veces',()=>{
  const input=data(),cable=input.equipment[0];cable.unitCost='123.456789';cable.currency='USD';cable.cableMeters='75.125';
  input.labor.items[0].unitCost='28.123456789';
  input.volume.items=[{id:'volume-3',concept:'Desglose',quantity:'75.125',sourceEquipment:cable.id,unitsPerPack:'305'}];
  const result=calculateMatrix(input),expected=123.456789*19/305;
  near(result.entries[0].mxnCost,expected);near(result.entries[0].usdCost,123.456789/305);
  near(result.laborDirect,75.125*28.123456789);near(result.volumeDirect,75.125*expected);
  near(result.totals.direct,75.125*expected+result.laborDirect);
  cable.unitCost='';assert.equal(calculateMatrix(input).entries[0].costMissing,true);
  cable.unitCost='0';assert.equal(calculateMatrix(input).entries[0].costMissing,false);
  input.labor.items[0].unitCost='0';assert.equal(calculateMatrix(input).totals.direct,0);
});

test('valida capacidad, metros, bobinas enteras y vínculos sin precios obligatorios',()=>{
  for(const [key,value] of [['metersPerReel','0'],['metersPerReel',''],['cableMeters','-5'],['cableMeters',''],['cableMode','otro'],['cableReels','1.5']]){
    const input=data();input.equipment[0].cableMode='reel';input.equipment[0][key]=value;
    assert.ok(validateMatrix(input).issues.some(issue=>issue.path==='equipment.0.'+key));
  }
  const input=data();input.labor.items.push({...input.labor.items[0],id:'labor-3'});
  assert.ok(validateMatrix(input).issues.some(issue=>issue.message.includes('duplicada')));
  input.equipment=[];assert.ok(validateMatrix(input).issues.some(issue=>issue.message.includes('vinculado')));
  assert.equal(cableAmounts(data().equipment[0]).suggested,1);
  const incomplete=data();Object.assign(incomplete.equipment[0],{concept:'',description:'',quantity:'',unitCost:''});
  assert.ok(validateMatrix(incomplete).issues.some(issue=>issue.path==='equipment.0.concept'),'Un cable activado no se descarta aunque solo tenga longitudes.');
});

test('sugiere longitud solo con una presentación explícita en metros',()=>{
  assert.equal(suggestCableCapacity('Bobina de Cable de 152 Metros (500 Pies) Cat6+ Calibre 23'),'152');
  assert.equal(suggestCableCapacity('Caja de 305 m / exterior'),'305');
  assert.equal(suggestCableCapacity('Cable CAT6-305 / 1000 Pies'),'');
  assert.equal(suggestCableCapacity('Bobina de 152 m o bobina de 305 metros'),'');
});

test('el borrador recupera los valores de cableado y su instalación sin perder decimales',()=>{
  const input=data();input.equipment[0].metersPerReel='305.0000';input.labor.items[0].unitCost='25.123456789';
  let raw=null;const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  assert.equal(writeMatrixDraft(storage,input).ok,true);const restored=readMatrixDraft(storage);
  assert.equal(restored.status,'restored');assert.equal(restored.draft.state.equipment[0].metersPerReel,'305.0000');
  assert.equal(restored.draft.state.labor.items[0].cableEquipment,'equipment-1');
  assert.equal(restored.draft.state.labor.items[0].unitCost,'25.123456789');
  near(calculateMatrix(restored.draft.state).totals.direct,calculateMatrix(input).totals.direct);
});
