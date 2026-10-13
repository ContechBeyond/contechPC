import test from 'node:test';
import assert from 'node:assert/strict';
import {VM_DEFAULTS,matrixFolio,matrixBookName,validateMatrix,calculateMatrix,vmNumber} from '../vm-core.js';
const input=()=>({client:'Cliente',project:'Proyecto',settings:{...VM_DEFAULTS},equipment:[{id:'e1',concept:'Equipo',description:'Descripción del equipo',brand:'Marca',model:'000123',supplier:'Proveedor',quantity:2,unitCost:100,currency:'MXN'}],labor:{enabled:false,items:[]},miscellaneous:{enabled:false,items:[]},volume:{enabled:false,items:[]}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
test('folio usa HHmmddMMyyyy de Ciudad de México y respeta medianoche',()=>{
  assert.equal(matrixFolio(new Date('2026-10-12T19:52:00Z')),'135212102026');
  assert.equal(matrixFolio(new Date('2026-10-13T05:59:00Z')),'235912102026');
  assert.equal(matrixFolio(new Date('2026-10-13T06:00:00Z')),'000013102026');
  assert.throws(()=>matrixFolio(new Date('invalid')));
  assert.equal(matrixBookName('Cliente','Cámaras','135212102026'),'Cliente - Cámaras VM 135212102026');
  assert.equal(matrixBookName('Cliente/A','Proyecto: 1','135212102026'),'Cliente-A - Proyecto- 1 VM 135212102026');
});
test('los costos conservan decimales y diferencian USD de MXN',()=>{
  const a=input();a.equipment[0].unitCost='10,535';a.equipment[0].quantity='2,5';
  const c=calculateMatrix(a);near(c.entries[0].mxnCost,10.535);near(c.entries[0].direct,26.3375);
  a.equipment[0].currency='USD';const usd=calculateMatrix(a);near(usd.entries[0].mxnCost,10.535*19);
  assert.equal(vmNumber('1.234,56789'),1234.56789);
});
test('mano de obra y misceláneos integran costos una vez; volumetría solo desglosa materiales',()=>{
  const a=input();a.labor={enabled:true,items:[{id:'l1',concept:'Instalación',description:'Instalación y pruebas',quantity:3,unitCost:20}]};
  a.miscellaneous={enabled:true,items:[{id:'m1',concept:'Materiales',description:'Consumibles',quantity:2,unitCost:5}]};
  a.volume={enabled:true,items:[{id:'v1',concept:'Material usado',description:'Desglose del equipo',quantity:25,unit:'m',sourceEquipment:'e1',unitsPerPack:100}]};
  const c=calculateMatrix(a);near(c.totals.direct,270);near(c.volumeDirect,25);assert.equal(c.entries.length,3);near(c.laborDirect,60);near(c.miscDirect,10);
  a.equipment[0].unitCost=200;near(calculateMatrix(a).volumeDirect,50);
  a.labor.enabled=false;a.miscellaneous.enabled=false;near(calculateMatrix(a).totals.direct,470);
});
test('ambos criterios de venta mantienen coherencia entre cantidad, unitario e importe',()=>{
  const a=input();a.equipment[0].unitCost='10.01';a.equipment[0].quantity=3;
  const exact=calculateMatrix(a);near(exact.totals.total,30.03*1.216*1.5*1.08);near(exact.entries[0].sellingUnit*3,exact.totals.total);
  a.settings.rounding='unit-rounded';const rounded=calculateMatrix(a);near(rounded.totals.total,3*19.72);near(rounded.entries[0].sellingUnit,19.72);
  a.settings={exchangeRate:1,indirectPct:0,feePct:0,commissionPct:0,provisionPct:0,rounding:'unit-rounded'};a.equipment[0].unitCost='5.475';near(calculateMatrix(a).entries[0].sellingUnit,5.48);
});
test('valida cero, campos faltantes y enlaces de volumetría eliminados sin cambiar su referencia',()=>{
  const a=input();a.equipment[0].unitCost=0;assert.equal(validateMatrix(a).valid,true);near(calculateMatrix(a).totals.total,0);
  a.equipment[0].quantity=0;assert.equal(validateMatrix(a).valid,false);a.equipment[0].quantity=2;
  a.settings.exchangeRate=0;assert.equal(validateMatrix(a).valid,false);a.settings.exchangeRate=19;
  a.volume={enabled:true,items:[{id:'v1',concept:'Cable',description:'Material utilizado',quantity:1,unit:'m',sourceEquipment:'eliminado',unitsPerPack:100}]};
  assert.ok(validateMatrix(a).issues.some(issue=>issue.path.endsWith('.sourceEquipment')));
  a.volume.enabled=false;assert.equal(validateMatrix(a).valid,false);
  a.volume.items=[];assert.equal(validateMatrix(a).valid,true);
  a.project='';assert.equal(validateMatrix(a).valid,false);
});
test('solo el concepto es obligatorio en las partidas; los campos vacíos no inventan importes',()=>{
  const a=input();a.equipment=[{id:'e1',concept:'Cámara'}];
  for(const section of ['labor','miscellaneous','volume'])a[section]={enabled:true,items:[{id:section,concept:section}]};
  assert.equal(validateMatrix(a).valid,true);
  const c=calculateMatrix(a);assert.equal(c.entries.length,3);near(c.totals.total,0);near(c.volumeDirect,0);
  assert.ok(c.entries.every(entry=>!entry.complete&&entry.costMissing));
  assert.ok(c.entries[0].quantityMissing);assert.equal(c.entries[0].currency,'USD');
  a.equipment[0].concept=' ';assert.equal(validateMatrix(a).valid,true);
  a.equipment[0].description='Equipo pendiente';assert.equal(validateMatrix(a).valid,false);
});
test('distingue un precio cero de uno vacío y suma únicamente cantidades y precios capturados',()=>{
  const a=input();a.equipment.push({id:'e2',concept:'Por definir',quantity:' ',unitCost:'100',currency:'MXN'});
  a.equipment.push({id:'e3',concept:'Sin precio',quantity:4,unitCost:'',currency:'USD'});
  a.equipment.push({id:'e4',concept:'Sin costo',quantity:1,unitCost:0,currency:'MXN'});
  const c=calculateMatrix(a);near(c.totals.direct,200);assert.equal(c.entries[1].quantityMissing,true);
  assert.equal(c.entries[2].costMissing,true);assert.equal(c.entries[3].complete,true);
  near(c.entries[3].sellingUnit,0);
  a.settings.rounding='unit-rounded';near(calculateMatrix(a).totals.total,2*196.99);
  a.equipment[1].quantity='abc';assert.equal(validateMatrix(a).valid,false);
  a.equipment[1].quantity=1;a.equipment[2].unitCost=-1;assert.equal(validateMatrix(a).valid,false);
});
test('la volumetría acepta datos pendientes y conserva la referencia al equipo',()=>{
  const a=input();a.equipment[0].unitCost='';
  a.volume={enabled:true,items:[{id:'v1',concept:'Cable',sourceEquipment:'e1',unitsPerPack:'',quantity:25}]};
  assert.equal(validateMatrix(a).valid,true);let v=calculateMatrix(a).volumes[0];
  assert.equal(v.sourceRow,5);assert.equal(v.costMissing,true);near(v.direct,0);
  a.volume.items[0].unitsPerPack=100;assert.equal(calculateMatrix(a).volumes[0].costMissing,true);
  a.equipment[0].unitCost=200;v=calculateMatrix(a).volumes[0];assert.equal(v.complete,true);near(v.direct,50);
});
