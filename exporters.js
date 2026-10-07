import {money,decimalString,longDate,coverDate,conditionLines,fileName} from './core.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const ASSET_CACHE=new Map();
async function asset(path,kind='buffer') {
  const key=path+':'+kind;
  if(!ASSET_CACHE.has(key))ASSET_CACHE.set(key,fetch(path,{cache:'no-cache'}).then(async r=>{if(!r.ok)throw new Error('No se pudo cargar un recurso de la plantilla. Recarga la página e inténtalo de nuevo.');return kind==='json'?r.json():kind==='text'?r.text():r.arrayBuffer();}).catch(e=>{ASSET_CACHE.delete(key);throw e;}));
  return ASSET_CACHE.get(key);
}
export const getDefaults=()=>asset('assets/defaults.json','json');
function child(element,name) {return Array.from(element.children).find(e=>e.namespaceURI===W&&e.localName===name);}
function children(element,name) {return Array.from(element.children).filter(e=>e.namespaceURI===W&&e.localName===name);}
function textOf(element) {return Array.from(element.getElementsByTagNameNS(W,'t')).map(t=>t.textContent).join('');}
function setAttr(e,name,value){e.setAttributeNS(W,'w:'+name,String(value));}
function element(doc,name){return doc.createElementNS(W,'w:'+name);}
function ensureChild(parent,name){return child(parent,name)||parent.appendChild(element(parent.ownerDocument,name));}
function setParagraphText(paragraph,value,{size,bold}={}) {
  const doc=paragraph.ownerDocument;
  const old=child(paragraph,'r');const run=old?old.cloneNode(true):element(doc,'r');
  for(const e of Array.from(run.children))if(e.localName!=='rPr')run.removeChild(e);
  if(size||bold!==undefined){const props=ensureChild(run,'rPr');if(size){setAttr(ensureChild(props,'sz'),'val',size*2);setAttr(ensureChild(props,'szCs'),'val',size*2);}if(bold!==undefined){setAttr(ensureChild(props,'b'),'val',bold?'1':'0');setAttr(ensureChild(props,'bCs'),'val',bold?'1':'0');}}
  const t=element(doc,'t');t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=value;run.appendChild(t);
  for(const e of Array.from(paragraph.children))if(e.localName!=='pPr')paragraph.removeChild(e);
  paragraph.appendChild(run);
}
function setCell(cell,value){const paragraphs=children(cell,'p');if(!paragraphs.length)throw new Error('La plantilla no contiene el formato de celda esperado.');setParagraphText(paragraphs[0],value);for(const p of paragraphs.slice(1))cell.removeChild(p);}
function replaceConditions(body,heading,nextHeading,value) {
  const entries=Array.from(body.children);
  const start=entries.findIndex(e=>e.localName==='p'&&textOf(e)===heading),end=entries.findIndex((e,i)=>i>start&&e.localName==='p'&&textOf(e)===nextHeading);
  if(start<0||end<0)throw new Error('No se encontró una sección de condiciones en la plantilla.');
  const old=entries.slice(start+1,end);const pattern=old.find(e=>e.localName==='p'&&textOf(e).trim());
  if(!pattern)throw new Error('La plantilla no tiene un párrafo de condiciones.');
  const template=pattern.cloneNode(true);
  for(const entry of old)body.removeChild(entry);
  for(const line of conditionLines(value)){
    const p=template.cloneNode(true);p.removeAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml','paraId');
    setParagraphText(p,line,{size:9,bold:false});const props=ensureChild(p,'pPr');
    for(const n of ['keepNext','pageBreakBefore']){const e=child(props,n);if(e)props.removeChild(e);}
    const ind=ensureChild(props,'ind');for(const name of ['left','right','firstLine'])setAttr(ind,name,0);
    const spacing=ensureChild(props,'spacing');setAttr(spacing,'before',20);setAttr(spacing,'after',0);setAttr(spacing,'line',256);setAttr(spacing,'lineRule','auto');
    body.insertBefore(p,entries[end]);
  }
  // A section gap belongs before the following heading, never under this one.
  const nextProps=ensureChild(entries[end],'pPr');setAttr(ensureChild(nextProps,'spacing'),'before',240);
}
export async function buildWordBlob(data) {
  const zip=await JSZip.loadAsync(await asset('assets/template.docx'));
  const xml=await zip.file('word/document.xml').async('string');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('No se pudo leer la plantilla Word.');
  const body=doc.getElementsByTagNameNS(W,'body')[0],paras=children(body,'p');
  const cover=paras.find(p=>{const ts=Array.from(p.getElementsByTagNameNS(W,'t'));return ts.length===2&&ts[1].textContent==='{{CLIENTE}}';});
  if(!cover)throw new Error('No se encontró el bloque de portada.');
  const ts=cover.getElementsByTagNameNS(W,'t');ts[0].textContent=data.project;ts[1].textContent=data.client;
  const date=paras.find(p=>textOf(p)==='{{FECHA}}');setParagraphText(date,coverDate(data.issueDate));
  const folio=paras.find(p=>textOf(p).startsWith('Folio:'));setParagraphText(folio,'Folio:  '+data.folio);
  const recipient=paras.find(p=>textOf(p)==='Estimado cliente');setParagraphText(recipient,data.recipient||'Estimado cliente');
  const validity=paras.find(p=>textOf(p).startsWith('*Vigencia'));setParagraphText(validity,'*Vigencia al '+longDate(data.expiryDate)+'.');
  replaceConditions(body,'CONSIDERACIONES TÉCNICAS','CONSIDERACIONES COMERCIALES',data.technical);
  replaceConditions(body,'CONSIDERACIONES COMERCIALES','CONDICIONES DE PAGO',data.commercial);
  const table=children(body,'tbl')[0],rows=children(table,'tr');
  const headerCells=children(rows[0],'tc'),headerTotal=headerCells.at(-1);
  const headerShade=child(child(headerCells[0],'tcPr'),'shd').cloneNode(true);
  const headerColor=headerCells[0].getElementsByTagNameNS(W,'color')[0];
  const totalCellProps=ensureChild(headerTotal,'tcPr'),oldShade=child(totalCellProps,'shd');
  if(oldShade)totalCellProps.replaceChild(headerShade,oldShade);else totalCellProps.appendChild(headerShade);
  const headerProperties=[
    ...children(headerTotal,'p').map(p=>ensureChild(ensureChild(p,'pPr'),'rPr')),
    ...Array.from(headerTotal.getElementsByTagNameNS(W,'r')).map(run=>ensureChild(run,'rPr'))
  ];
  for(const props of headerProperties){
    const oldColor=child(props,'color'),color=headerColor.cloneNode(true);
    if(oldColor)props.replaceChild(color,oldColor);else props.appendChild(color);
    setAttr(ensureChild(props,'b'),'val','1');setAttr(ensureChild(props,'bCs'),'val','1');
  }
  const pattern=rows[1].cloneNode(true),total=rows.at(-1);
  const widths=[340,1650,3638,920,1100,1190];
  const grid=child(table,'tblGrid');children(grid,'gridCol').forEach((col,i)=>setAttr(col,'w',widths[i]));
  for(const row of rows.slice(1,-1))table.removeChild(row);
  data.rows.forEach((row,index)=>{
    const clone=pattern.cloneNode(true);const values=[String(index+1),row.concept,row.description,decimalString(row.quantity,'quantity').replace('.',','),money(row.unitCents),money(row.amountCents)];
    children(clone,'tc').forEach((cell,i)=>{setCell(cell,values[i]);setAttr(ensureChild(ensureChild(cell,'tcPr'),'tcW'),'w',widths[i]);});
    table.insertBefore(clone,total);
  });
  setCell(children(total,'tc').at(-1),money(data.total));
  const totalProps=child(children(total,'tc')[0],'tcPr');setAttr(ensureChild(totalProps,'gridSpan'),'val',5);setAttr(ensureChild(totalProps,'tcW'),'w',7648);
  zip.file('word/document.xml',new XMLSerializer().serializeToString(doc));
  const settings=new DOMParser().parseFromString(await zip.file('word/settings.xml').async('string'),'application/xml');
  setAttr(ensureChild(settings.documentElement,'updateFields'),'val','true');
  zip.file('word/settings.xml',new XMLSerializer().serializeToString(settings));
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE',compressionOptions:{level:6}});
}
let pdfReady;
function loadScript(src) {return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('No se pudo cargar el generador de PDF.'));document.head.appendChild(s);});}
function base64(buffer){let s='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
async function dataUrl(path,type){return 'data:'+type+';base64,'+base64(await asset(path));}
async function preparePdf(){
  if(!pdfReady)pdfReady=(async()=>{
    const [,regular,bold,cover,letterhead,bank,defaults]=await Promise.all([loadScript('vendor/pdfmake.min.js'),asset('assets/Carlito-Regular.ttf'),asset('assets/Carlito-Bold.ttf'),dataUrl('assets/cover.png','image/png'),dataUrl('assets/letterhead.png','image/png'),dataUrl('assets/bank.jpg','image/jpeg'),getDefaults()]);
    pdfMake.addVirtualFileSystem({'Carlito-Regular.ttf':base64(regular),'Carlito-Bold.ttf':base64(bold)});
    pdfMake.fonts={Carlito:{normal:'Carlito-Regular.ttf',bold:'Carlito-Bold.ttf',italics:'Carlito-Regular.ttf',bolditalics:'Carlito-Bold.ttf'}};
    const faces=[new FontFace('Carlito',regular,{weight:'400'}),new FontFace('Carlito',bold,{weight:'700'})];
    for(const face of faces){await face.load();document.fonts.add(face);}
    return {cover,letterhead,bank,defaults};
  })().catch(error=>{pdfReady=null;throw error;});
  return pdfReady;
}
function lineCount(text,width,bold=false,size=11) {
  const context=document.createElement('canvas').getContext('2d');context.font=`${bold?'700':'400'} ${size}px Carlito`;
  let count=0;for(const paragraph of String(text).split('\n')){let line='',n=1;for(const word of paragraph.split(/\s+/)){if(context.measureText(word).width>width){if(line){n++;line='';}for(const character of word){const next=line+character;if(line&&context.measureText(next).width>width){n++;line=character;}else line=next;}continue;}const next=line?line+' '+word:word;if(context.measureText(next).width>width&&line){n++;line=word;}else line=next;}count+=n;}return Math.max(1,count);
}
export async function buildPdfBlob(data) {
  const assets=await preparePdf();
  const widths=[12,78,177.4,41.5,50.5,55],fontSize=11,lineHeight=14.41;
  const header=['#','Concepto','Descripción','Cantidad','P. Unitario','Total'].map(text=>({text,bold:true,color:'#ffffff',fillColor:'#434343',alignment:'center',margin:[0,1,0,1]}));
  const body=[header];
  for(let index=0;index<data.rows.length;index++){
    const row=data.rows[index];const values=[String(index+1),row.concept,row.description,decimalString(row.quantity,'quantity').replace('.',','),money(row.unitCents),money(row.amountCents)];
    const lines=values.map((value,i)=>lineCount(value,widths[i]));const max=Math.max(2,...lines);
    if(max*lineHeight>580)throw new Error(`El concepto ${index+1} ocupa más de una página. Divide o acorta su descripción para generar el PDF con la fila completa.`);
    body.push(values.map((text,i)=>({text,fillColor:'#D9EAD3',alignment:i>=4?'right':'center',margin:[0,Math.max(0,(max-lines[i])*lineHeight/2),0,Math.max(0,(max-lines[i])*lineHeight/2)]})));
  }
  body.push([{text:'Total sin IVA',colSpan:5,bold:true,color:'white',fillColor:'#434343',alignment:'right',margin:[0,5,0,5]},{},{},{},{},{text:money(data.total),bold:true,color:'white',fillColor:'#434343',alignment:'right',margin:[0,5,0,5]}]);
  const technical=conditionLines(data.technical).map(text=>({text,fontSize:9,lineHeight:1.07,alignment:'justify',margin:[0,0,0,1]}));
  const commercial=conditionLines(data.commercial).map(text=>({text,fontSize:9,lineHeight:1.07,alignment:'justify',margin:[0,0,0,1]}));
  const dd={
    pageSize:'LETTER',pageMargins:[85.05,83,85.05,70.85],defaultStyle:{font:'Carlito',fontSize:11,lineHeight:1.08},
    info:{title:`Propuesta comercial ${data.project} ${data.client}`,author:'Contech Secure Solutions',subject:`Folio ${data.folio}`},
    images:{cover:assets.cover,letterhead:assets.letterhead,bank:assets.bank},
    background:page=>({image:page===1?'cover':'letterhead',width:612,height:792,absolutePosition:{x:0,y:0}}),
    footer:(page,count)=>({text:[{text:'Página '},{text:String(page),bold:true},{text:' de '},{text:String(count),bold:true}],fontSize:10,alignment:'right',margin:[85.05,7.5,85.05,0]}),
    content:[
      {text:'PROPUESTA COMERCIAL',bold:true,color:'white',fontSize:20,absolutePosition:{x:129.1,y:327.4}},
      {columns:[{width:196,stack:[{text:data.project},{text:data.client}]}],fontSize:20,bold:true,color:'white',lineHeight:1.08,alignment:'center',absolutePosition:{x:122,y:367.2}},
      {text:coverDate(data.issueDate),fontSize:12,bold:true,color:'white',absolutePosition:{x:183.8,y:452.8}},
      {columns:[{width:468,text:'Folio:  '+data.folio}],fontSize:10,bold:true,color:'white',alignment:'center',absolutePosition:{x:72,y:541}},
      {text:'PROPUESTA COMERCIAL',fontSize:14,bold:true,lineHeight:1,pageBreak:'before',margin:[0,0,0,11]},
      {text:data.recipient||'Estimado cliente',fontSize:12,bold:true,lineHeight:1.08,margin:[0,0,0,10]},
      {text:assets.defaults.intro[0],fontSize:12,lineHeight:1.08,alignment:'justify',margin:[0,0,0,8]},
      {text:assets.defaults.intro[1],fontSize:12,lineHeight:1.08,alignment:'justify',margin:[0,0,0,32]},
      {text:'PROPUESTA COMERCIAL',fontSize:12,bold:true,lineHeight:1,margin:[0,0,0,14]},
      {table:{headerRows:1,dontBreakRows:true,keepWithHeaderRows:1,widths,body},layout:{hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=> '#000000',vLineColor:()=> '#000000',paddingLeft:()=>2,paddingRight:()=>2,paddingTop:()=>2,paddingBottom:()=>2}},
      {text:'CONSIDERACIONES TÉCNICAS',fontSize:11,bold:true,lineHeight:1.08,pageBreak:'before',margin:[0,0,0,0]},
      ...technical,
      {text:'CONSIDERACIONES COMERCIALES',fontSize:11,bold:true,lineHeight:1.08,margin:[0,12,0,0]},
      ...commercial,
      {text:'CONDICIONES DE PAGO',fontSize:11,bold:true,lineHeight:1.08,margin:[0,20,0,2]},
      {text:'Transferencia bancaria y/o Depósito Bancario. Nombre de la empresa y/o Beneficiario',fontSize:8,lineHeight:1.2,margin:[0,0,0,1]},
      {text:'Datos Bancarios',fontSize:8,lineHeight:1.2,margin:[0,0,0,6]},
      {image:'bank',width:454,margin:[-6.6,0,0,16]},
      {text:assets.defaults.confidentiality,fontSize:7,alignment:'justify',lineHeight:1.2,margin:[0,0,0,1]},
      {text:'*Vigencia al '+longDate(data.expiryDate)+'.',fontSize:7,lineHeight:1.2}
    ],
    pageBreakBefore(current,following,next){return current.text&&['CONSIDERACIONES TÉCNICAS','CONSIDERACIONES COMERCIALES','CONDICIONES DE PAGO','PROPUESTA COMERCIAL'].includes(current.text)&&following.length===0;}
  };
  return new Promise((resolve,reject)=>{try{pdfMake.createPdf(dd).getBlob(resolve);}catch(e){reject(e);}});
}
export function downloadBlob(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function downloadName(data,extension){return fileName(data)+'.'+extension;}
