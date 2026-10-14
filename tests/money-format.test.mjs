import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {money,editableMoney,cents,importMatrix,validateRows} from '../core.js';
import {printedText} from '../vf-pdf.js';
const require=createRequire(import.meta.url),XLSX=require('../vendor/xlsx.full.min.js'),JSZip=require('../vendor/jszip.min.js');

test('importes y campos editables usan miles con coma y decimales con punto',()=>{
  for(const [value,expected] of [[0,'0.00'],[200,'2.00'],[233223,'2,332.23'],[811598,'8,115.98'],[123456789,'1,234,567.89']]){
    assert.equal(money(value),'$'+expected);assert.equal(editableMoney(value),expected);assert.equal(cents(editableMoney(value)),value);
  }
});
test('importa ambos formatos sin alterar importes y presenta advertencias con separadores correctos',()=>{
  const mapping={concept:0,description:1,quantity:2,unitPrice:3,amount:4};
  for(const [price,total] of [['$2.332,23','$4.664,46'],['$2,332.23','$4,664.46'],[2332.23,4664.46]]){
    const imported=importMatrix([['Concepto','Descripción','Cantidad','Precio unitario','Importe'],['Equipo','Descripción',2,price,total]],mapping,0);
    assert.equal(imported.rows[0].unitPrice,'2,332.23');assert.equal(imported.rows[0].amount,'4,664.46');assert.equal(validateRows(imported.rows).total,466446);
  }
  const result=validateRows([{id:'1',concept:'Cable',description:'',quantity:'75',unitPrice:'49.25',amount:'3,693.60'}]);
  assert.match(result.issues.find(item=>item.type==='mismatch').message,/\$3,693\.75; el importe indica \$3,693\.60/);
});
test('Versión Final respeta formato numérico y precisión sin usar texto localizado en caché',t=>{
  const previous=globalThis.XLSX;globalThis.XLSX=XLSX;t.after(()=>{globalThis.XLSX=previous;});
  for(const [cell,expected] of [
    [{t:'n',v:2332.23,z:'"$"#,##0.00',w:'$2.332,23'},'$2,332.23'],
    [{t:'n',v:8115.98,z:'"$"#,##0.00'},'$8,115.98'],
    [{t:'n',v:1234567.89,z:'"$"#,##0.00'},'$1,234,567.89'],
    [{t:'n',v:.216,z:'0.0%',w:'21,6%'},'21.6%'],
    [{t:'n',v:49.248123456,z:'0.000000000'},'49.248123456'],
    [{t:'n',v:46000,z:'dd/mm/yyyy'},XLSX.SSF.format('dd/mm/yyyy',46000)],
    [{t:'s',v:'Modelo 2.332,23'},'Modelo 2.332,23']
  ]){const before=structuredClone(cell);assert.equal(printedText(cell),expected);assert.deepEqual(cell,before);}
});
test('Word y PDF reciben los mismos importes, totales y cantidades decimales',async t=>{
  const dom=new JSDOM(),keys=['document','DOMParser','XMLSerializer','JSZip','fetch','FontFace','pdfMake'],previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  t.after(()=>{dom.window.close();Object.assign(globalThis,previous);});
  const document=dom.window.document;let definition;
  document.fonts={add(){}};document.head.appendChild=script=>{queueMicrotask(()=>script.onload());return script;};
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:String(text).length*5})});
  Object.assign(globalThis,{document,DOMParser:dom.window.DOMParser,XMLSerializer:dom.window.XMLSerializer,JSZip,FontFace:class{async load(){return this;}},
    fetch:async path=>{const bytes=await readFile(new URL('../'+path,import.meta.url));return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes)};},
    pdfMake:{addVirtualFileSystem(){},createPdf(dd){definition=dd;return {getBlob:callback=>callback(new Blob(['test']))};}}
  });
  const {buildWordBlob,buildPdfBlob}=await import('../exporters.js?money-test');
  const data={project:'Cableado',client:'Tabachines',folio:'132314102026',issueDate:'2026-10-14',expiryDate:'2026-10-31',technical:'Suministro.',commercial:'Precios sin IVA.',rows:[{concept:'Cable',description:'Cable por metro.',quantity:'1.25',unitCents:811598,amountCents:1014498}],total:1014498};
  const docx=await buildWordBlob(data),zip=await JSZip.loadAsync(await docx.arrayBuffer()),xml=await zip.file('word/document.xml').async('string');
  for(const text of ['$8,115.98','$10,144.98','>1.25<'])assert.ok(xml.includes(text),text);
  assert.equal(xml.includes('$8.115,98'),false);
  await buildPdfBlob(data);const table=definition.content.find(node=>node.table).table;
  assert.equal(table.body[1][3].text,'1.25');assert.equal(table.body[1][4].text,'$8,115.98');assert.equal(table.body[1][5].text,'$10,144.98');assert.equal(table.body.at(-1).at(-1).text,'$10,144.98');
});
