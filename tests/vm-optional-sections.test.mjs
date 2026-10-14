import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {VM_DEFAULTS,vmItemHasData,vmSectionItems,validateMatrix,calculateMatrix} from '../vm-core.js';
import {buildMatrixWorkbook} from '../vm-xlsx.js';
import {convertMatrix,sheetReferences} from '../vf-core.js';

const require=createRequire(import.meta.url),JSZip=require('../vendor/jszip.min.js'),XLSX=require('../vendor/xlsx.full.min.js');
const templateBuffer=await readFile(new URL('../assets/vm-template.xlsx',import.meta.url));
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const blank=id=>({id,concept:'',description:'',quantity:'',unitCost:'',unit:'m',sourceEquipment:'',unitsPerPack:''});
const input=()=>({client:'Prueba',project:'Secciones automáticas',settings:{...VM_DEFAULTS},equipment:[{id:'equipment-1',concept:'Cable',description:'Cable exterior',quantity:'2.5',unitCost:'10.123456789',currency:'USD'}],labor:{enabled:false,items:[]},volume:{enabled:false,items:[]},miscellaneous:{enabled:false,items:[]}});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);

test('solo datos capturados incluyen las partidas, sin contar IDs ni defaults de presentación',()=>{
  for(const section of ['equipment','labor','volume','miscellaneous']){
    assert.equal(vmItemHasData(section,{...blank(section+'-1'),currency:'USD'}),false);
    assert.equal(vmItemHasData(section,{...blank(section+'-1'),concept:'  \n '}),false);
    for(const key of ['concept','description','quantity','unitCost'])assert.equal(vmItemHasData(section,{...blank(section+'-1'),[key]:key==='unitCost'?0:'Dato'}),true);
  }
  for(const key of ['model','brand','supplier'])assert.equal(vmItemHasData('equipment',{...blank('equipment-1'),[key]:'Dato'}),true);
  for(const key of ['sourceEquipment','unitsPerPack','unit'])assert.equal(vmItemHasData('volume',{...blank('volume-1'),[key]:key==='unit'?'pza':'Dato'}),true);
  assert.equal(vmItemHasData('labor',{...blank('labor-1'),unit:'pza'}),false);
  assert.equal(vmItemHasData('labor',null),false);assert.deepEqual(vmSectionItems('labor',null),[]);
  const row={...blank('labor-2'),concept:'Instalación'},rows=[blank('labor-1'),row,blank('labor-3')];
  assert.deepEqual(vmSectionItems('labor',rows),[row]);assert.equal(vmSectionItems('labor',rows)[0],row);assert.equal(rows.length,3);
});

test('las secciones vacías se omiten y los datos de borradores antiguos se incluyen aunque enabled sea false',()=>{
  const data=input();
  for(const section of ['labor','volume','miscellaneous'])data[section]={enabled:true,items:[blank(section+'-2')]};
  assert.equal(validateMatrix(data).valid,true);
  const before=calculateMatrix(data);assert.deepEqual(before.labor,[]);assert.deepEqual(before.misc,[]);assert.deepEqual(before.volumes,[]);
  data.labor={enabled:false,items:[blank('labor-2'),{...blank('labor-3'),concept:'Instalación',quantity:'3',unitCost:'21.123456789'}]};
  data.miscellaneous={enabled:false,items:[blank('miscellaneous-4'),{...blank('miscellaneous-5'),concept:'Consumibles',quantity:'2',unitCost:'5.23456789'}]};
  data.volume={enabled:false,items:[blank('volume-6'),{...blank('volume-7'),concept:'Cableado',quantity:'25',sourceEquipment:'equipment-1',unitsPerPack:'100'}]};
  const after=calculateMatrix(data);assert.equal(after.entries.length,3);
  near(after.totals.direct,before.totals.direct+3*21.123456789+2*5.23456789);
  near(after.volumeDirect,25*(10.123456789*19)/100);
  assert.equal(after.labor[0].id,'labor-3');assert.equal(after.entries[1].sourceIndex,0);assert.equal(after.volumes[0].sourceRow,5);
});

test('una partida parcialmente capturada exige concepto y conserva el índice original para localizarla',()=>{
  const data=input();
  data.labor.items=[blank('labor-2'),{...blank('labor-3'),unitCost:'0'}];
  data.miscellaneous.items=[blank('miscellaneous-4'),blank('miscellaneous-5'),{...blank('miscellaneous-6'),description:'Pendiente'}];
  data.volume.items=[blank('volume-7'),{...blank('volume-8'),unit:'pza'}];
  const issues=validateMatrix(data).issues;
  for(const path of ['labor.1.concept','miscellaneous.2.concept','volume.1.concept'])assert.ok(issues.some(issue=>issue.path===path),path);
  assert.equal(issues.some(issue=>/desactiva la sección/.test(issue.message)),false);
  data.labor.items[1].concept='Sin costo';data.miscellaneous.items[2].concept='Pendiente';data.volume.items[1].concept='Piezas';
  assert.equal(validateMatrix(data).valid,true);
  data.volume.items[1].sourceEquipment='equipment-eliminado';
  assert.ok(validateMatrix(data).issues.some(issue=>issue.path==='volume.1.sourceEquipment'));
});

function xml(source){return new DOMParser().parseFromString(source,'application/xml');}
async function inspectWorkbook(result){
  const bytes=new Uint8Array(await result.blob.arrayBuffer()),zip=await JSZip.loadAsync(bytes),workbook=xml(await zip.file('xl/workbook.xml').async('string')),rels=xml(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
  const names=[...workbook.getElementsByTagNameNS(MAIN,'sheet')].map(node=>({name:node.getAttribute('name'),id:node.getAttribute('r:id')})),docs=new Map();
  for(const sheet of names){const relation=[...rels.documentElement.children].find(node=>node.getAttribute('Id')===sheet.id);docs.set(sheet.name,xml(await zip.file('xl/'+relation.getAttribute('Target')).async('string')));}
  for(const [sheetName,doc] of docs)for(const formula of doc.getElementsByTagNameNS(MAIN,'f')){
    assert.equal(formula.textContent.includes('#REF!'),false,sheetName+' '+formula.textContent);
    for(const reference of sheetReferences(formula.textContent))assert.ok(docs.has(reference),sheetName+' referencia una hoja ausente: '+reference);
  }
  const cell=(sheet,address)=>[...docs.get(sheet).getElementsByTagNameNS(MAIN,'c')].find(node=>node.getAttribute('r')===address);
  const formula=(sheet,address)=>cell(sheet,address)?.getElementsByTagNameNS(MAIN,'f')[0]?.textContent;
  const value=(sheet,address)=>Number(cell(sheet,address)?.getElementsByTagNameNS(MAIN,'v')[0]?.textContent);
  return {bytes,zip,workbook,names:names.map(sheet=>sheet.name),docs,cell,formula,value};
}

test('el Excel incluye solo hojas con datos y mantiene referencias, precisión, formatos y conversión VF',async t=>{
  const dom=new JSDOM(),previous={DOMParser:globalThis.DOMParser,XMLSerializer:globalThis.XMLSerializer,JSZip:globalThis.JSZip,XLSX:globalThis.XLSX};
  Object.assign(globalThis,{DOMParser:dom.window.DOMParser,XMLSerializer:dom.window.XMLSerializer,JSZip,XLSX});
  t.after(()=>{dom.window.close();Object.assign(globalThis,previous);});
  const options={templateBuffer,measureText:value=>String(value).length*6},when=new Date('2026-10-13T19:52:00Z');

  await t.test('cable por metro y bobina conserva cálculos y referencias de Cliente e instalación',async()=>{
    const data=input(),cable=data.equipment[0];Object.assign(cable,{cableEnabled:true,cableMode:'meter',metersPerReel:'305',cableMeters:'75.125',cableReels:'',unitCost:'3050.123456789',currency:'MXN'});
    data.labor.items=[{...blank('labor-2'),concept:'Instalación de cableado',quantity:'999',unitCost:'25',cableEquipment:cable.id}];
    data.volume.items=[{...blank('volume-3'),concept:'Desglose',quantity:'75.125',sourceEquipment:cable.id,unitsPerPack:'305'}];
    let result=await buildMatrixWorkbook(data,when,options),book=await inspectWorkbook(result);
    assert.equal(book.formula('Matriz','J5'),'3050.123456789/305');near(book.value('Matriz','J5'),3050.123456789/305);
    assert.equal(book.formula('Mano de Obra','E5'),"'Matriz'!H5");near(book.value('Mano de Obra','G5'),75.125*25);
    near(book.value('Cliente','E5'),75.125);assert.equal(book.formula('Cliente','E5'),"'Matriz'!H5");
    near(book.value('Volumetria','F5'),3050.123456789/305);assert.match(book.formula('Volumetria','F5'),/\*305\/305/);
    near(book.value('Resumen Costos','K6'),result.calculation.totals.total);
    let vf=await convertMatrix(book.bytes,result.name);near(vf.workbook.Sheets.Matriz.R10.v,result.calculation.totals.total);
    cable.cableMode='reel';cable.cableMeters='400';result=await buildMatrixWorkbook(data,when,options);book=await inspectWorkbook(result);
    assert.equal(book.formula('Matriz','H5'),'ROUNDUP(400/305,0)');near(book.value('Cliente','E5'),2);
    const displayed=XLSX.read(book.bytes,{type:'array',cellNF:true});
    assert.equal(XLSX.SSF.format(displayed.Sheets.Matriz.J5.z,displayed.Sheets.Matriz.J5.v),'$3,050.12');
    near(book.value('Mano de Obra','E5'),400);assert.equal(book.formula('Mano de Obra','E5'),undefined);
    near(result.calculation.totals.direct,2*3050.123456789+400*25);
    vf=await convertMatrix(book.bytes,result.name);near(vf.workbook.Sheets.Matriz.R10.v,result.calculation.totals.total);
    cable.cableMode='meter';cable.currency='USD';result=await buildMatrixWorkbook(data,when,options);book=await inspectWorkbook(result);
    assert.equal(book.formula('Matriz','I5'),'3050.123456789/305');assert.equal(book.formula('Matriz','J5'),'IF(ISNUMBER(I5),I5*$J$3,"-")');
    near(book.value('Matriz','J5'),3050.123456789/305*19);
  });

  await t.test('venta de equipo no produce hojas opcionales vacías y se convierte a VF de dos hojas',async()=>{
    const data=input();for(const section of ['labor','volume','miscellaneous'])data[section]={enabled:true,items:[blank(section+'-2')]};
    const sourceSnapshot=JSON.stringify(data),result=await buildMatrixWorkbook(data,when,options),book=await inspectWorkbook(result);
    assert.deepEqual(book.names,['Resumen Costos','Matriz','Cliente']);assert.deepEqual(result.sheets,book.names);assert.equal(JSON.stringify(data),sourceSnapshot);
    near(book.value('Matriz','J5'),10.123456789*19);near(book.value('Matriz','R9'),result.calculation.totals.total);assert.equal(book.formula('Resumen Costos','K6'),"'Matriz'!R9");
    const originalZip=await JSZip.loadAsync(templateBuffer),originalStyles=xml(await originalZip.file('xl/styles.xml').async('string')),styles=xml(await book.zip.file('xl/styles.xml').async('string'));
    for(const name of ['fonts','fills','borders'])assert.equal(new XMLSerializer().serializeToString(styles.getElementsByTagNameNS(MAIN,name)[0]),new XMLSerializer().serializeToString(originalStyles.getElementsByTagNameNS(MAIN,name)[0]));
    const vf=await convertMatrix(book.bytes,result.name);assert.deepEqual(vf.sheets,['Resumen Costos','Matriz']);near(vf.workbook.Sheets.Matriz.R9.v,result.calculation.totals.total);
    const loaded=XLSX.read(book.bytes,{type:'array',cellFormula:true});assert.equal(loaded.Sheets.Cliente.C5.v,'Cable');near(loaded.Sheets.Cliente.G5.v,result.calculation.totals.total);
  });

  await t.test('filtra huecos y enlaza filas contiguas de mano de obra, volumetría y misceláneos',async()=>{
    const data=input();
    data.labor.items=[blank('labor-2'),{...blank('labor-3'),concept:'Instalación',quantity:'2.5',unitCost:'21.123456789'},blank('labor-4'),{...blank('labor-5'),concept:'Pruebas',quantity:'3',unitCost:'7.123456789'}];
    data.miscellaneous.items=[blank('miscellaneous-6'),{...blank('miscellaneous-7'),concept:'Consumibles',quantity:'2',unitCost:'5.23456789'}];
    data.volume.items=[blank('volume-8'),{...blank('volume-9'),concept:'Cableado',quantity:'25',sourceEquipment:'equipment-1',unitsPerPack:'100'}];
    const result=await buildMatrixWorkbook(data,when,options),book=await inspectWorkbook(result);
    assert.deepEqual(book.names,['Resumen Costos','Matriz','Cliente','Mano de Obra','Volumetria','Misceláneos']);
    assert.equal(book.formula('Matriz','C6'),"'Mano de Obra'!D5");assert.equal(book.formula('Matriz','C7'),"'Mano de Obra'!D6");assert.equal(book.formula('Matriz','J8'),"'Misceláneos'!F6");
    assert.equal(book.formula('Matriz','D8'),"'Misceláneos'!C5");assert.equal(book.formula('Volumetria','F5'),"IF(ISNUMBER('Matriz'!J5),'Matriz'!J5/100,\"-\")");
    near(book.value('Mano de Obra','G7'),2.5*21.123456789+3*7.123456789);near(book.value('Misceláneos','F6'),2*5.23456789);near(book.value('Matriz','R12'),result.calculation.totals.total);
    const vf=await convertMatrix(book.bytes,result.name);assert.deepEqual(vf.sheets,['Resumen Costos','Matriz','Mano de Obra']);near(vf.workbook.Sheets.Matriz.R12.v,result.calculation.totals.total);
  });

  await t.test('volumetría y misceláneos funcionan sin hoja de mano de obra',async()=>{
    const data=input();data.volume.items=[{...blank('volume-2'),concept:'Cableado',quantity:'12.75',unitCost:'3.123456789'}];data.miscellaneous.items=[{...blank('miscellaneous-3'),concept:'Conectores',quantity:'1',unitCost:'0'}];
    const result=await buildMatrixWorkbook(data,when,options),book=await inspectWorkbook(result);
    assert.deepEqual(book.names,['Resumen Costos','Matriz','Cliente','Volumetria','Misceláneos']);
    near(book.value('Volumetria','G6'),12.75*3.123456789);assert.equal(book.value('Misceláneos','F6'),0);
    const vf=await convertMatrix(book.bytes,result.name);assert.deepEqual(vf.sheets,['Resumen Costos','Matriz']);near(vf.workbook.Sheets.Matriz.R10.v,result.calculation.totals.total);
  });

  await t.test('mano de obra sin equipos usa fórmulas válidas y conserva pendientes como guiones',async()=>{
    const data=input();data.equipment=[];data.labor.items=[blank('labor-1'),{...blank('labor-2'),concept:'Servicio'}];
    const result=await buildMatrixWorkbook(data,when,options),book=await inspectWorkbook(result);
    assert.deepEqual(book.names,['Resumen Costos','Matriz','Cliente','Mano de Obra']);assert.equal(book.formula('Matriz','C5'),"'Mano de Obra'!D5");
    assert.equal(book.cell('Mano de Obra','G5').getAttribute('t'),'str');assert.equal(book.cell('Mano de Obra','G5').getElementsByTagNameNS(MAIN,'v')[0].textContent,'-');assert.equal(result.calculation.totals.total,0);
    const vf=await convertMatrix(book.bytes,result.name);assert.deepEqual(vf.sheets,['Resumen Costos','Matriz','Mano de Obra']);
  });
});
