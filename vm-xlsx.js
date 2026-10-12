import {calculateMatrix,matrixFolio,matrixBookName,vmNumber,vmIsBlank,miscellaneousText} from './vm-core.js';
const numberOrDash=value=>vmIsBlank(value)?'-':vmNumber(value);
const amount=(entry,key)=>entry.complete?entry[key]:'-';
const product=(a,b)=>`IF(AND(ISNUMBER(${a}),ISNUMBER(${b})),${a}*${b},"-")`;
const guarded=(source,formula)=>`IF(ISNUMBER(${source}),${formula},"-")`;
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const list=(parent,name)=>Array.from(parent.getElementsByTagNameNS(MAIN,name));
const direct=(parent,name)=>Array.from(parent.children).find(node=>node.namespaceURI===MAIN&&node.localName===name);
const create=(doc,name)=>doc.createElementNS(MAIN,name);
const cellCol=address=>address.replace(/\d+$/,'');
const colNumber=name=>[...name].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
let templatePromise;
async function template(){
  if(!templatePromise)templatePromise=fetch('assets/vm-template.xlsx',{cache:'no-cache'}).then(async response=>{if(!response.ok)throw new Error('No se pudo cargar el formato de la matriz. Recarga la página.');return response.arrayBuffer();}).catch(error=>{templatePromise=null;throw error;});
  return templatePromise;
}
function parseXml(source){const doc=new DOMParser().parseFromString(source,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('El formato de la matriz no se pudo leer.');return doc;}
const xml=doc=>new XMLSerializer().serializeToString(doc);
function ensure(root,name){let node=direct(root,name);if(!node){node=create(root.ownerDocument,name);const order=['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','smartTags','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst'];const after=Array.from(root.children).find(other=>order.indexOf(other.localName)>order.indexOf(name));root.insertBefore(node,after||null);}return node;}

function stylesCatalog(doc){
  const root=doc.documentElement,xfs=direct(root,'cellXfs'),variants=new Map();
  function variant(original,key,edit){const id=original+':'+key;if(variants.has(id))return variants.get(id);const xf=xfs.children[Number(original)].cloneNode(true);edit(xf);const next=xfs.children.length;xfs.append(xf);xfs.setAttribute('count',String(xfs.children.length));variants.set(id,String(next));return String(next);}
  function quantity(original,value){
    if(typeof value!=='number'||Number.isInteger(value))return original;
    let fmts=direct(root,'numFmts');if(!fmts){fmts=create(doc,'numFmts');root.insertBefore(fmts,root.firstChild);}
    let format=Array.from(fmts.children).find(node=>node.getAttribute('formatCode')==='0.##########');
    if(!format){format=create(doc,'numFmt');format.setAttribute('numFmtId',String(Math.max(163,...Array.from(fmts.children).map(n=>Number(n.getAttribute('numFmtId'))))+1));format.setAttribute('formatCode','0.##########');fmts.append(format);fmts.setAttribute('count',String(fmts.children.length));}
    return variant(original,'quantity',xf=>{xf.setAttribute('numFmtId',format.getAttribute('numFmtId'));xf.setAttribute('applyNumberFormat','1');});
  }
  function wrap(original){return variant(original,'wrap',xf=>{let align=direct(xf,'alignment');if(!align){align=create(doc,'alignment');xf.append(align);}align.setAttribute('wrapText','1');xf.setAttribute('applyAlignment','1');});}
  return {quantity,wrap};
}
function textMeasurer(custom){
  if(custom)return custom;
  let context;try{context=globalThis.document?.createElement('canvas').getContext('2d');}catch{}
  return (value,points=11)=>{if(context){context.font=`${points}pt Calibri, Carlito, Arial, sans-serif`;return context.measureText(String(value)).width;}return [...String(value)].reduce((sum,c)=>sum+(c===' '?3.5:/[il.,'`]/.test(c)?3.2:/[MW@]/.test(c)?11:7),0)*(points/11);};
}
function wrappedLines(value,width,measure,points=11){
  let lines=0;
  for(const paragraph of String(value).split('\n')){
    let line='';lines++;
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(measure(line?line+' '+word:word,points)<=width){line=line?line+' '+word:word;continue;}
      if(line){lines++;line='';}
      if(measure(word,points)<=width){line=word;continue;}
      for(const character of word){if(line&&measure(line+character,points)>width){lines++;line='';}line+=character;}
    }
  }
  return Math.max(1,lines);
}
function worksheet(doc,{bodyRow,totalRow,headerRow=4,start,end,minimumHeight=37.5},catalog,measure){
  const root=doc.documentElement,data=direct(root,'sheetData');
  const oldRows=new Map(Array.from(data.children).map(row=>[Number(row.getAttribute('r')),row.cloneNode(true)]));
  const originalMerges=list(root,'mergeCell').map(node=>node.getAttribute('ref'));
  const body=oldRows.get(bodyRow),total=oldRows.get(totalRow);
  const widths=new Map();for(const column of list(root,'col'))for(let i=Number(column.getAttribute('min'));i<=Number(column.getAttribute('max'));i++)widths.set(i,Number(column.getAttribute('width'))*7+5);
  data.replaceChildren(...Array.from(data.children).filter(row=>Number(row.getAttribute('r'))<=headerRow));
  const values=new Map();
  function clone(source,index){const row=source.cloneNode(true);row.setAttribute('r',String(index));for(const cell of Array.from(row.children)){cell.setAttribute('r',cellCol(cell.getAttribute('r'))+index);cell.replaceChildren();cell.removeAttribute('t');}return row;}
  function write(row,col,value,formula,quantity=false){
    if(value===undefined||value===null||(typeof value==='string'&&!value.trim()))value='-';
    const address=col+row.getAttribute('r');let cell=Array.from(row.children).find(c=>c.getAttribute('r')===address);
    if(!cell){cell=create(doc,'c');cell.setAttribute('r',address);cell.setAttribute('s','1');const after=Array.from(row.children).find(c=>colNumber(cellCol(c.getAttribute('r')))>colNumber(col));row.insertBefore(cell,after||null);}
    cell.replaceChildren();cell.removeAttribute('t');if(quantity)cell.setAttribute('s',catalog.quantity(cell.getAttribute('s')||'1',value));
    if(formula){const f=create(doc,'f');f.textContent=formula;cell.append(f);if(typeof value==='string')cell.setAttribute('t','str');const v=create(doc,'v');v.textContent=String(value);cell.append(v);}
    else if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('La matriz contiene un importe no válido.');const v=create(doc,'v');v.textContent=String(value);cell.append(v);}
    else{cell.setAttribute('t','inlineStr');const inline=create(doc,'is'),t=create(doc,'t');t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=String(value??'');inline.append(t);cell.append(inline);}
    values.set(address,value);return cell;
  }
  function fit(row,minimum=minimumHeight){
    let height=minimum;
    for(const cell of row.children){const value=values.get(cell.getAttribute('r'));if(typeof value!=='string'||!value)continue;const width=widths.get(colNumber(cellCol(cell.getAttribute('r'))))||130;const lines=wrappedLines(value,Math.max(12,width-10),measure);height=Math.max(height,lines*14+7);}
    if(height>409.5)throw new Error('Una descripción supera la altura admitida por Excel. Acorta el texto de la partida para mantenerlo completo.');
    row.setAttribute('ht',String(height));row.setAttribute('customHeight','1');
  }
  function append(index,source=body){const row=clone(source,index);data.append(row);return row;}
  function headerCell(address,value){const index=Number(address.match(/\d+$/)[0]);let row=Array.from(data.children).find(r=>Number(r.getAttribute('r'))===index);if(!row){row=create(doc,'row');row.setAttribute('r',String(index));data.append(row);}return write(row,cellCol(address),value);}
  function title(address,value,span){const cell=headerCell(address,value),row=cell.parentElement;const width=span.reduce((sum,col)=>sum+(widths.get(colNumber(col))||130),0);const lines=wrappedLines(value,width-10,measure,16);if(lines>1){cell.setAttribute('s',catalog.wrap(cell.getAttribute('s')));row.setAttribute('ht',String(Math.max(30,lines*20+6)));row.setAttribute('customHeight','1');}}
  function finish(last,merges){
    for(const [index,original] of oldRows)if(index>totalRow&&index<=totalRow+5)data.append(clone(original,last+(index-totalRow)));
    const footers=originalMerges.filter(ref=>Number(ref.match(/\d+/)[0])>totalRow).map(ref=>ref.replace(/\d+/g,value=>String(last+(Number(value)-totalRow))));
    merges=[...merges,...footers];
    const mergeNode=ensure(root,'mergeCells');mergeNode.replaceChildren();for(const ref of merges){const node=create(doc,'mergeCell');node.setAttribute('ref',ref);mergeNode.append(node);}mergeNode.setAttribute('count',String(merges.length));
    const dimensionEnd=Math.max(last,...merges.flatMap(ref=>ref.match(/\d+/g).map(Number)));
    ensure(root,'dimension').setAttribute('ref',`A1:${end}${dimensionEnd}`);
    const view=list(root,'sheetView')[0];if(view){view.setAttribute('topLeftCell','A1');view.setAttribute('tabSelected','0');}
    const setup=ensure(root,'pageSetup');for(const [name,value] of Object.entries({paperSize:'1',orientation:'landscape',fitToWidth:'1',fitToHeight:'0'}))setup.setAttribute(name,value);setup.removeAttribute('scale');
    const props=ensure(root,'sheetPr');let page=direct(props,'pageSetUpPr');if(!page){page=create(doc,'pageSetUpPr');props.append(page);}page.setAttribute('fitToPage','1');
    const options=ensure(root,'printOptions');options.setAttribute('headings','0');options.setAttribute('gridLines','0');
    return {xml:xml(doc),area:`$${start}$2:$${end}$${last}`,headerRow};
  }
  return {append,write,fit,headerCell,title,finish,oldRows,total};
}

export async function buildMatrixWorkbook(input,when=new Date(),options={}){
  const calculation=calculateMatrix(input),folio=matrixFolio(when),name=matrixBookName(input.client,input.project,folio);
  const zip=await JSZip.loadAsync(options.templateBuffer||await template()),styles=parseXml(await zip.file('xl/styles.xml').async('string')),catalog=stylesCatalog(styles),measure=textMeasurer(options.measureText);
  const workbook=parseXml(await zip.file('xl/workbook.xml').async('string')),relationships=parseXml(await zip.file('xl/_rels/workbook.xml.rels').async('string')),types=parseXml(await zip.file('[Content_Types].xml').async('string'));
  const sheets=list(workbook,'sheet').map(node=>{const relation=Array.from(relationships.documentElement.children).find(r=>r.getAttribute('Id')===node.getAttributeNS(REL,'id'));return {node,name:node.getAttribute('name'),relation,path:'xl/'+relation.getAttribute('Target')};});
  const keep=sheets.filter(sheet=>!(sheet.name==='Volumetria'&&!input.volume?.enabled)&&!(sheet.name==='Misceláneos'&&!input.miscellaneous?.enabled));
  for(const sheet of sheets.filter(sheet=>!keep.includes(sheet))){sheet.node.remove();sheet.relation.remove();zip.remove(sheet.path);for(const type of Array.from(types.documentElement.children))if(type.getAttribute('PartName')==='/'+sheet.path)type.remove();}
  const docs=new Map();for(const sheet of keep)docs.set(sheet.name,parseXml(await zip.file(sheet.path).async('string')));
  const outputs=new Map(),entries=calculation.entries,last=entries.at(-1).row,columns=['K','L','M','N','O','P','Q','R'],keys=['direct','indirect','integrated','fee','withFee','commission','provision','total'];
  const mat=worksheet(docs.get('Matriz'),{bodyRow:5,totalRow:13,start:'B',end:'R',minimumHeight:91.5},catalog,measure);
  mat.title('B2',input.project.trim(),['B','C','D']);mat.headerCell('J3',calculation.settings.exchangeRate);
  for(const [col,value,source] of [['L',calculation.rates.indirect,'E'],['N',calculation.rates.fee,'G'],['P',calculation.rates.commission,'I'],['Q',calculation.rates.provision,'J']]){const row=Array.from(docs.get('Matriz').getElementsByTagNameNS(MAIN,'row')).find(r=>r.getAttribute('r')==='3');mat.write(row,col,value,`'Resumen Costos'!${source}4`);}
  for(const entry of entries){
    const r=entry.row,row=mat.append(r),labor=entry.kind==='labor',misc=entry.kind==='miscellaneous',sourceRow=5+entry.sourceIndex;
    mat.write(row,'B',r-4);mat.write(row,'C',entry.concept,labor?`'Mano de Obra'!D${sourceRow}`:undefined);
    const descriptionFormula=misc?calculation.misc.map((_,i)=>`'Misceláneos'!C${5+i}`).join('&CHAR(10)&'):undefined;
    mat.write(row,'D',entry.description,descriptionFormula);
    for(const [col,key] of [['E','brand'],['F','model'],['G','supplier']])mat.write(row,col,entry.kind==='equipment'?String(entry[key]??'').trim():'-');
    mat.write(row,'H',entry.quantityMissing?'-':entry.quantity,labor?`'Mano de Obra'!E${sourceRow}`:undefined,true);
    mat.write(row,'I',entry.costMissing?'-':entry.usdCost,entry.kind==='equipment'&&entry.currency==='USD'?undefined:guarded(`J${r}`,`J${r}/$J$3`));
    mat.write(row,'J',entry.costMissing?'-':entry.mxnCost,labor?`'Mano de Obra'!F${sourceRow}`:misc?`'Misceláneos'!F${5+calculation.misc.length}`:entry.currency==='USD'?guarded(`I${r}`,`I${r}*$J$3`):undefined);
    const formulas=[labor?`'Mano de Obra'!G${sourceRow}`:product(`H${r}`,`J${r}`),guarded(`K${r}`,`K${r}*$L$3`),guarded(`K${r}`,`SUM(K${r}:L${r})`),guarded(`M${r}`,`M${r}*$N$3`),guarded(`M${r}`,`M${r}+N${r}`),guarded(`O${r}`,`O${r}*$P$3`),guarded(`O${r}`,`O${r}*$Q$3`),calculation.settings.rounding==='unit-rounded'?`IF(AND(ISNUMBER(H${r}),ISNUMBER(J${r})),H${r}*ROUND(J${r}*(1+$L$3)*(1+$N$3)*(1+$P$3+$Q$3),2),"-")`:guarded(`O${r}`,`SUM(O${r}:Q${r})`)];
    columns.forEach((col,i)=>mat.write(row,col,amount(entry,keys[i]),formulas[i]));mat.fit(row);
  }
  const matHeader=mat.append(calculation.totalRow-1,mat.oldRows.get(12));columns.forEach((col,i)=>mat.write(matHeader,col,['Costo Directo','Costo Indirecto','Costo Integrado','Fee','Costo + Fee','Comisión','Aprovisionamiento','Total'][i]));
  const matTotal=mat.append(calculation.totalRow,mat.total);columns.forEach((col,i)=>mat.write(matTotal,col,calculation.totals[keys[i]],`SUM(${col}5:${col}${last})`));
  outputs.set('Matriz',mat.finish(calculation.totalRow,['B2:D2']));

  const summary=worksheet(docs.get('Resumen Costos'),{bodyRow:6,totalRow:7,headerRow:5,start:'B',end:'K',minimumHeight:30},catalog,measure);
  for(const [address,value] of [['E4',calculation.rates.indirect],['G4',calculation.rates.fee],['I4',calculation.rates.commission],['J4',calculation.rates.provision]])summary.headerCell(address,value);
  const summaryRow=summary.append(6);summary.write(summaryRow,'B',1);summary.write(summaryRow,'C',input.project.trim());
  ['D','E','F','G','H','I','J','K'].forEach((col,i)=>summary.write(summaryRow,col,calculation.totals[keys[i]],`'Matriz'!${columns[i]}${calculation.totalRow}`));summary.fit(summaryRow);
  const summaryTotal=summary.append(7,summary.total);summary.write(summaryTotal,'B','Total');['D','E','F','G','H','I','J','K'].forEach((col,i)=>summary.write(summaryTotal,col,calculation.totals[keys[i]],`SUM(${col}6:${col}6)`));
  outputs.set('Resumen Costos',summary.finish(7,['B2:K2','B7:C7']));

  const client=worksheet(docs.get('Cliente'),{bodyRow:5,totalRow:10,start:'B',end:'G',minimumHeight:93.75},catalog,measure);client.title('B2',input.project.trim(),['B','C','D','E','F','G']);
  for(const entry of entries){const row=client.append(entry.row),r=entry.row;client.write(row,'B',r-4,`'Matriz'!B${r}`);client.write(row,'C',entry.concept,`'Matriz'!C${r}`);client.write(row,'D',entry.description,`'Matriz'!D${r}`);client.write(row,'E',entry.quantityMissing?'-':entry.quantity,`'Matriz'!H${r}`,true);client.write(row,'F',amount(entry,'sellingUnit'),`IF(AND(ISNUMBER(E${r}),E${r}>0,ISNUMBER(G${r})),G${r}/E${r},"-")`);client.write(row,'G',amount(entry,'total'),`'Matriz'!R${r}`);client.fit(row);}
  const clientTotal=client.append(last+1,client.total);client.write(clientTotal,'B','Total sin IVA');client.write(clientTotal,'G',calculation.totals.total,`SUM(G5:G${last})`);outputs.set('Cliente',client.finish(last+1,['B2:G2',`B${last+1}:F${last+1}`]));

  const labor=worksheet(docs.get('Mano de Obra'),{bodyRow:5,totalRow:7,start:'C',end:'G',minimumHeight:48},catalog,measure);
  const laborItems=calculation.labor.length?calculation.labor:[{concept:'',quantity:'',unitCost:''}];
  laborItems.forEach((item,i)=>{const r=5+i,row=labor.append(r),complete=!vmIsBlank(item.quantity)&&!vmIsBlank(item.unitCost);labor.write(row,'C',i+1);labor.write(row,'D',item.concept);labor.write(row,'E',numberOrDash(item.quantity),undefined,true);labor.write(row,'F',numberOrDash(item.unitCost));labor.write(row,'G',complete?vmNumber(item.quantity)*vmNumber(item.unitCost):'-',product(`E${r}`,`F${r}`));labor.fit(row);});
  const laborEnd=5+laborItems.length,laborTotal=labor.append(laborEnd,labor.total);labor.write(laborTotal,'C','Total de mano de obra');labor.write(laborTotal,'G',calculation.laborDirect,`SUM(G5:G${laborEnd-1})`);outputs.set('Mano de Obra',labor.finish(laborEnd,['C2:G2',`C${laborEnd}:F${laborEnd}`]));

  if(docs.has('Volumetria')){
    const volume=worksheet(docs.get('Volumetria'),{bodyRow:5,totalRow:6,start:'B',end:'G'},catalog,measure);
    calculation.volumes.forEach((item,i)=>{const r=5+i,row=volume.append(r),source=`'Matriz'!J${item.sourceRow}`;volume.write(row,'B',item.concept);volume.write(row,'C',item.description);volume.write(row,'D',item.quantityMissing?'-':item.quantity,undefined,true);volume.write(row,'E',String(item.unit??'').trim());volume.write(row,'F',item.costMissing?'-':item.unitCost,item.sourceRow&&!vmIsBlank(item.unitsPerPack)?guarded(source,`${source}/${vmNumber(item.unitsPerPack)}`):undefined);volume.write(row,'G',amount(item,'direct'),product(`D${r}`,`F${r}`));volume.fit(row);});
    const end=5+calculation.volumes.length,total=volume.append(end,volume.total);volume.write(total,'B','Total de volumetría');volume.write(total,'G',calculation.volumeDirect,`SUM(G5:G${end-1})`);outputs.set('Volumetria',volume.finish(end,['B2:G2',`B${end}:F${end}`]));
  }
  if(docs.has('Misceláneos')){
    const misc=worksheet(docs.get('Misceláneos'),{bodyRow:5,totalRow:6,start:'B',end:'F',minimumHeight:91.5},catalog,measure);
    calculation.misc.forEach((item,i)=>{const r=5+i,row=misc.append(r),complete=!vmIsBlank(item.quantity)&&!vmIsBlank(item.unitCost);misc.write(row,'B',i+1);misc.write(row,'C',miscellaneousText(item));misc.write(row,'D',numberOrDash(item.quantity),undefined,true);misc.write(row,'E',numberOrDash(item.unitCost));misc.write(row,'F',complete?vmNumber(item.quantity)*vmNumber(item.unitCost):'-',product(`D${r}`,`E${r}`));misc.fit(row);});
    const end=5+calculation.misc.length,total=misc.append(end,misc.total);misc.write(total,'B','TOTALES');misc.write(total,'F',calculation.miscComplete?calculation.miscDirect:'-',`IF(COUNT(F5:F${end-1})>0,SUM(F5:F${end-1}),"-")`);outputs.set('Misceláneos',misc.finish(end,['B2:F2','B3:F3',`B${end}:E${end}`]));
  }
  let names=direct(workbook.documentElement,'definedNames');if(!names){names=create(workbook,'definedNames');workbook.documentElement.insertBefore(names,direct(workbook.documentElement,'calcPr')||null);}names.replaceChildren();
  for(const [index,sheet] of keep.entries()){
    const output=outputs.get(sheet.name);zip.file(sheet.path,output.xml);const range=create(workbook,'definedName');range.setAttribute('name','_xlnm.Print_Area');range.setAttribute('localSheetId',String(index));range.textContent=`'${sheet.name}'!${output.area}`;names.append(range);
    const title=create(workbook,'definedName');title.setAttribute('name','_xlnm.Print_Titles');title.setAttribute('localSheetId',String(index));title.textContent=`'${sheet.name}'!$${output.headerRow}:$${output.headerRow}`;names.append(title);
  }
  const selected=list(docs.get('Resumen Costos'),'sheetView')[0];selected?.setAttribute('tabSelected','1');zip.file(keep[0].path,xml(docs.get('Resumen Costos')));
  zip.file('xl/styles.xml',xml(styles));zip.file('xl/workbook.xml',xml(workbook));zip.file('xl/_rels/workbook.xml.rels',xml(relationships));zip.file('[Content_Types].xml',xml(types));
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  return {blob:new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name,folio,calculation,sheets:keep.map(sheet=>sheet.name),createdAt:when};
}
