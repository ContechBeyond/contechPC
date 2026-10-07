const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const elements=(parent,name)=>Array.from(parent.getElementsByTagNameNS(MAIN,name));
const direct=(parent,name)=>Array.from(parent.children).find(node=>node.namespaceURI===MAIN&&node.localName===name);
const normalized=name=>name.normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().replace(/\s+/g,' ').toLowerCase();
export function finalBookName(name){
  const base=String(name).replace(/\.xlsx$/i,'');
  if(!/(^|[^\p{L}\p{N}_])VM(?=$|[^\p{L}\p{N}_])/u.test(base))throw new Error('El nombre del libro debe contener «VM» como palabra independiente.');
  return base.replace(/(^|[^\p{L}\p{N}_])VM(?=$|[^\p{L}\p{N}_])/gu,'$1VF');
}
export function exportTitle(disposition){
  const encoded=disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if(encoded)return decodeURIComponent(encoded[1].trim()).replace(/\.xlsx$/i,'');
  return disposition?.match(/filename\s*=\s*"([^"]+)"/i)?.[1]?.replace(/\.xlsx$/i,'')||null;
}
export function sheetReferences(formula){
  const result=[];
  const matcher=/"(?:[^"]|"")*"|('(?:[^']|'')+'|(?:\[[^\]]+\])?[\p{L}\p{N}_.\\]+(?::[\p{L}\p{N}_.\\]+)?)!/gu;
  for(const match of formula.matchAll(matcher))if(match[1])result.push(match[1].startsWith("'")?match[1].slice(1,-1).replace(/''/g,"'"):match[1]);
  // Literal INDIRECT targets are references too, even though they are strings.
  for(const match of formula.matchAll(/\bINDIRECT\s*\(\s*"((?:[^"]|"")*)"/gi))result.push(...sheetReferences(match[1].replace(/""/g,'"')));
  return result;
}
export function preservedSheets(names){
  const choose=(aliases,label)=>{
    const found=names.filter(name=>aliases.includes(normalized(name)));
    if(found.length!==1)throw new Error(found.length?`Hay dos hojas de ${label}. Conserva una sola «Resumen Costos» o «Resumen» en la VM.`:`No se encontró la hoja «${label}».`);
    return found[0];
  };
  return [choose(['resumen costos','resumen'],'Resumen Costos'),choose(['matriz'],'Matriz'),choose(['mano de obra'],'Mano de Obra')];
}
function parseXml(text,path){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error(`No se pudo leer ${path} del archivo Excel.`);
  return doc;
}
function resolvePart(base,target){
  const parts=(target.startsWith('/')?target.slice(1):base.slice(0,base.lastIndexOf('/')+1)+target).split('/'),result=[];
  for(const part of parts){if(part==='..')result.pop();else if(part!=='.'&&part)result.push(part);}
  return result.join('/');
}
function cellValue(cell){
  const type=cell.getAttribute('t')||'n',value=direct(cell,'v');
  return {type,value:type==='inlineStr'?elements(cell,'t').map(t=>t.textContent).join(''):value?.textContent??null};
}
export function contentBounds(sheet){
  const addresses=elements(sheet,'c').filter(cell=>direct(cell,'f')||cellValue(cell).value!==null&&cellValue(cell).value!=='').map(cell=>XLSX.utils.decode_cell(cell.getAttribute('r')));
  if(!addresses.length)throw new Error('Una de las hojas conservadas no contiene datos para imprimir.');
  const bounds={s:{r:Math.min(...addresses.map(c=>c.r)),c:Math.min(...addresses.map(c=>c.c))},e:{r:Math.max(...addresses.map(c=>c.r)),c:Math.max(...addresses.map(c=>c.c))}};
  for(const merge of elements(sheet,'mergeCell')){
    const range=XLSX.utils.decode_range(merge.getAttribute('ref'));
    if(range.s.r<=bounds.e.r&&range.e.r>=bounds.s.r&&range.s.c<=bounds.e.c&&range.e.c>=bounds.s.c){bounds.s.r=Math.min(bounds.s.r,range.s.r);bounds.s.c=Math.min(bounds.s.c,range.s.c);bounds.e.r=Math.max(bounds.e.r,range.e.r);bounds.e.c=Math.max(bounds.e.c,range.e.c);}
  }
  return bounds;
}
function appendOrdered(parent,node){
  const order=['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst'];
  const after=Array.from(parent.children).find(other=>order.indexOf(other.localName)>order.indexOf(node.localName));
  parent.insertBefore(node,after||null);return node;
}
function ensure(parent,name,ordered=false){return direct(parent,name)||(ordered?appendOrdered(parent,parent.ownerDocument.createElementNS(MAIN,name)):parent.appendChild(parent.ownerDocument.createElementNS(MAIN,name)));}
function printSettings(doc,title,sheetName){
  const root=doc.documentElement,properties=ensure(root,'sheetPr',true);ensure(properties,'pageSetUpPr').setAttribute('fitToPage','1');
  const setup=ensure(root,'pageSetup',true);for(const [key,value] of Object.entries({paperSize:1,orientation:'landscape',fitToWidth:1,fitToHeight:0}))setup.setAttribute(key,value);
  setup.removeAttribute('scale');
  const options=ensure(root,'printOptions',true);options.setAttribute('headings','0');options.setAttribute('gridLines','0');
  const margins=ensure(root,'pageMargins',true);for(const [key,value] of Object.entries({left:.33,right:.33,top:.75,bottom:.5,header:.25,footer:.2}))margins.setAttribute(key,value);
  const footer=ensure(root,'headerFooter',true);footer.setAttribute('differentOddEven','0');footer.setAttribute('differentFirst','0');
  for(const node of Array.from(footer.children))footer.removeChild(node);
  ensure(footer,'oddHeader').textContent=`&L&"Arial,Regular"&10${title.replace(/&/g,'&&')}&R&"Arial,Regular"&10${sheetName.replace(/&/g,'&&')}`;
  ensure(footer,'oddFooter').textContent='&R&"Arial,Regular"&10&P de &N';
}
export async function convertMatrix(buffer,originalName,onProgress=()=>{}){
  const name=finalBookName(originalName);onProgress('Revisando hojas y dependencias…');
  let zip;try{zip=await JSZip.loadAsync(buffer,{checkCRC32:true});}catch{throw new Error('Carga un archivo Excel válido (.xlsx).');}
  const read=async path=>{if(!zip.file(path))throw new Error(`El archivo no contiene ${path}.`);return parseXml(await zip.file(path).async('string'),path);};
  const workbook=await read('xl/workbook.xml'),relationships=await read('xl/_rels/workbook.xml.rels'),types=await read('[Content_Types].xml');
  if(workbook.documentElement.namespaceURI!==MAIN)throw new Error('Guarda el libro como «Libro de Excel (.xlsx)» antes de cargarlo.');
  const relationNodes=Array.from(relationships.documentElement.children),sheetNodes=elements(workbook,'sheet');
  const sheets=sheetNodes.map((node,index)=>{const relation=relationNodes.find(r=>r.getAttribute('Id')===node.getAttributeNS(REL,'id'));if(!relation)throw new Error('El libro contiene una relación de hoja incompleta.');return {name:node.getAttribute('name'),index,node,path:resolvePart('xl/workbook.xml',relation.getAttribute('Target')),relation};});
  const names=sheets.map(s=>s.name),keep=preservedSheets(names),removed=names.filter(n=>!keep.includes(n));
  const source=XLSX.read(buffer,{type:'array',cellFormula:true,cellNF:true,cellStyles:true,cellDates:false,sheetStubs:true});
  const docs=new Map();for(const sheet of sheets)if(keep.includes(sheet.name))docs.set(sheet.name,await read(sheet.path));
  const isRemovedRef=ref=>{
    if(ref.includes('['))return false;
    if(ref.includes(':')){const [first,last]=ref.split(':').map(n=>names.findIndex(x=>x.toLowerCase()===n.toLowerCase()));if(first<0||last<0)throw new Error(`No se reconoce el rango de hojas ${ref}.`);return names.slice(Math.min(first,last),Math.max(first,last)+1).some(n=>removed.includes(n));}
    const original=names.find(n=>n.toLowerCase()===ref.toLowerCase());if(!original)throw new Error(`La VM contiene una referencia a la hoja inexistente «${ref}».`);return removed.includes(original);
  };
  const named=elements(workbook,'definedName').map(node=>({node,name:node.getAttribute('name'),scope:node.hasAttribute('localSheetId')?Number(node.getAttribute('localSheetId')):null,formula:node.textContent}));
  const tokens=formula=>Array.from(formula.replace(/"(?:[^"]|"")*"|'(?:[^']|'')+'!/g,'').matchAll(/[\p{L}_\\][\p{L}\p{N}_.\\]*/gu),m=>m[0].toLowerCase());
  const namedInScope=(name,index)=>named.find(n=>n.name.toLowerCase()===name&&n.scope===index)||named.find(n=>n.name.toLowerCase()===name&&n.scope===null);
  const nameStatus=new Map();
  function nameDepends(entry,visiting=new Set()){
    if(nameStatus.has(entry))return nameStatus.get(entry);
    if(visiting.has(entry))throw new Error(`La VM contiene una referencia circular en el nombre «${entry.name}».`);
    const next=new Set(visiting);next.add(entry);
    const dependency=entry.scope!==null&&removed.includes(names[entry.scope])||sheetReferences(entry.formula).some(isRemovedRef)||tokens(entry.formula).some(name=>{const other=namedInScope(name,entry.scope);return other?nameDepends(other,next):false;});
    nameStatus.set(entry,dependency);return dependency;
  }
  const removedNames=new Set(named.filter(n=>nameDepends(n)));
  const depends=(formula,sheetName)=>sheetReferences(formula).some(isRemovedRef)||tokens(formula).some(name=>{const entry=namedInScope(name,sheetName?names.indexOf(sheetName):null);return entry?removedNames.has(entry):false;});
  let preservedFormulas=0,frozen=0,checkedValues=0;const before=new Map();
  for(const sheetName of keep){
    const doc=docs.get(sheetName),cells=elements(doc,'c'),groups=new Map(),affectedGroups=new Set();
    for(const cell of cells){
      const address=cell.getAttribute('r'),value=cellValue(cell),f=direct(cell,'f');before.set(sheetName+'!'+address,value);
      if(value.type==='e'||f?.textContent.replace(/"(?:[^"]|"")*"/g,'').includes('#REF!'))throw new Error(`La VM ya contiene un error en «${sheetName}», celda ${address}. Corrígelo antes de convertir.`);
      if(!f)continue;
      const formula=source.Sheets[sheetName][address]?.f||f.textContent;
      if(!formula)throw new Error(`No se pudo interpretar la fórmula de «${sheetName}», celda ${address}.`);
      if(value.value===null||value.value===''&&value.type==='n')throw new Error(`La fórmula de «${sheetName}», celda ${address}, no tiene un resultado guardado. Abre y guarda la VM en Excel o Google Sheets para calcularla.`);
      const group=f.getAttribute('t')==='shared'?f.getAttribute('si'):null;
      if(group!==null){if(!groups.has(group))groups.set(group,[]);groups.get(group).push({cell,f,formula});}
      if(/\bINDIRECT\s*\(/i.test(formula)&&!/^.*\bINDIRECT\s*\(\s*"[^"\n]*"\s*(?:,\s*(?:TRUE|FALSE|0|1)\s*)?\).*$/i.test(formula))throw new Error(`La referencia INDIRECT dinámica de «${sheetName}», celda ${address}, requiere revisión antes de retirar hojas.`);
      if(depends(formula,sheetName)){
        if(f.getAttribute('t')==='array')throw new Error(`La fórmula matricial de «${sheetName}», celda ${address}, depende de una hoja que se retirará. Guárdala como valores en la VM antes de convertir.`);
        if(group!==null)affectedGroups.add(group);cell.removeChild(f);frozen++;
      }else preservedFormulas++;
    }
    // A shared anchor cannot be removed while its followers still depend on it.
    for(const group of affectedGroups)for(const {cell,f,formula} of groups.get(group))if(f.parentNode===cell){for(const key of ['t','si','ref'])f.removeAttribute(key);f.textContent=formula;}
    for(const tag of ['formula','formula1','formula2'])for(const formula of elements(doc,tag))if(depends(formula.textContent,sheetName))throw new Error(`Una regla de formato o validación de «${sheetName}» depende de una hoja que se retirará. Revisa esa regla en la VM.`);
    printSettings(doc,name,sheetName);
    for(const view of elements(doc,'sheetView'))view.setAttribute('tabSelected',sheetName===keep[0]?'1':'0');
  }
  onProgress('Conservando formatos y verificando los importes…');
  const sheetContainer=direct(workbook.documentElement,'sheets');
  for(const sheet of sheets){sheetContainer.removeChild(sheet.node);if(removed.includes(sheet.name)){
    zip.remove(sheet.path);zip.remove(sheet.path.replace(/([^/]+)$/,'_rels/$1.rels'));relationships.documentElement.removeChild(sheet.relation);
  }}
  for(const name of keep){const sheet=sheets.find(s=>s.name===name);sheet.node.removeAttribute('state');sheetContainer.appendChild(sheet.node);}
  let defined=direct(workbook.documentElement,'definedNames');
  if(!defined){defined=workbook.createElementNS(MAIN,'definedNames');const following=Array.from(workbook.documentElement.children).find(n=>['calcPr','oleSize','customWorkbookViews','pivotCaches','smartTagPr','smartTagTypes','webPublishing','fileRecoveryPr','webPublishObjects','extLst'].includes(n.localName));workbook.documentElement.insertBefore(defined,following||null);}
  for(const n of named){if(removedNames.has(n)||n.name==='_xlnm.Print_Area'){defined.removeChild(n.node);continue;}if(n.scope!==null)n.node.setAttribute('localSheetId',keep.indexOf(names[n.scope]));}
  for(const [index,sheetName] of keep.entries()){
    const node=workbook.createElementNS(MAIN,'definedName');node.setAttribute('name','_xlnm.Print_Area');node.setAttribute('localSheetId',index);
    const range=contentBounds(docs.get(sheetName));node.textContent=`'${sheetName.replace(/'/g,"''")}'!$${XLSX.utils.encode_col(range.s.c)}$${range.s.r+1}:$${XLSX.utils.encode_col(range.e.c)}$${range.e.r+1}`;defined.appendChild(node);
  }
  for(const view of elements(workbook,'workbookView')){view.setAttribute('activeTab','0');view.setAttribute('firstSheet','0');}
  // The calculation chain stores the former sheet indices. Excel rebuilds it.
  for(const relation of relationNodes)if(relation.getAttribute('Type')?.endsWith('/calcChain')){zip.remove(resolvePart('xl/workbook.xml',relation.getAttribute('Target')));if(relation.parentNode)relation.parentNode.removeChild(relation);}
  for(const override of Array.from(types.documentElement.children))if(override.localName==='Override'&&!zip.file(override.getAttribute('PartName').slice(1)))types.documentElement.removeChild(override);
  const serializer=new XMLSerializer();
  for(const sheetName of keep){
    const doc=docs.get(sheetName);
    for(const cell of elements(doc,'c')){
      const address=cell.getAttribute('r'),old=before.get(sheetName+'!'+address),value=cellValue(cell);
      if(value.type!==old.type||value.value!==old.value)throw new Error(`Cambió el valor de «${sheetName}», celda ${address}. No se generará la VF.`);
      if(value.value!==null)checkedValues++;
      const formula=direct(cell,'f');if(formula&&depends(source.Sheets[sheetName][address]?.f||formula.textContent,sheetName))throw new Error('Se detectó una dependencia pendiente de una hoja retirada.');
    }
    zip.file(sheets.find(s=>s.name===sheetName).path,serializer.serializeToString(doc));
  }
  zip.file('xl/workbook.xml',serializer.serializeToString(workbook));zip.file('xl/_rels/workbook.xml.rels',serializer.serializeToString(relationships));zip.file('[Content_Types].xml',serializer.serializeToString(types));
  if(zip.file('docProps/app.xml')){
    const app=await read('docProps/app.xml'),vector=Array.from(app.getElementsByTagName('*')).find(n=>n.localName==='TitlesOfParts');
    if(vector){const v=vector.firstElementChild;if(v){while(v.firstChild)v.removeChild(v.firstChild);v.setAttribute('size',keep.length);for(const title of keep){const e=app.createElementNS('http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes','vt:lpstr');e.textContent=title;v.appendChild(e);}}}
    const pairs=Array.from(app.getElementsByTagName('*')).find(n=>n.localName==='HeadingPairs');
    if(pairs){const children=Array.from(pairs.getElementsByTagName('*'));for(let i=0;i<children.length;i++)if(children[i].localName==='lpstr'&&/worksheets/i.test(children[i].textContent)){const count=children.slice(i+1).find(n=>n.localName==='i4');if(count)count.textContent=String(keep.length);}}
    zip.file('docProps/app.xml',serializer.serializeToString(app));
  }
  const excel=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
  const verified=XLSX.read(await excel.arrayBuffer(),{type:'array',cellFormula:true,cellNF:true,cellStyles:true,sheetStubs:true});
  if(JSON.stringify(verified.SheetNames)!==JSON.stringify(keep))throw new Error('No se pudo verificar el orden de las hojas finales.');
  for(const sheetName of keep)for(const [address,cell] of Object.entries(verified.Sheets[sheetName]))if(!address.startsWith('!')){
    const original=source.Sheets[sheetName][address];if(original?.v!==cell.v||original?.t!==cell.t)throw new Error(`No coincide el valor final de «${sheetName}», celda ${address}.`);
    if(cell.f?.replace(/"(?:[^"]|"")*"/g,'').includes('#REF!')||cell.t==='e')throw new Error(`Se detectó un error en la VF: ${sheetName}!${address}.`);
  }
  return {name,excel,source,workbook:verified,zip,docs,sheets:keep,removed,frozen,preservedFormulas,checkedValues};
}
