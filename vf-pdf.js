import {elements,contentBounds} from './vf-core.js';
import {preparePdf} from './exporters.js';
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const node=(parent,name)=>parent?Array.from(parent.children).find(n=>n.namespaceURI===MAIN&&n.localName===name):null;
const list=(parent,name)=>parent?Array.from(parent.children).filter(n=>n.namespaceURI===MAIN&&n.localName===name):[];
const number=(element,key,fallback)=>element?.hasAttribute(key)?Number(element.getAttribute(key)):fallback;
function parseXml(text){return new DOMParser().parseFromString(text,'application/xml');}
function color(element,theme,fallback='#000000'){
  if(!element)return fallback;
  let hex=element.getAttribute('rgb')?.slice(-6);
  if(!hex&&element.hasAttribute('theme'))hex=theme[Number(element.getAttribute('theme'))];
  if(!hex&&element.hasAttribute('indexed')){
    const palette='000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCCC 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333 000000 FFFFFF'.split(' ');hex=palette[Number(element.getAttribute('indexed'))];
  }
  if(!hex)return fallback;
  const tint=number(element,'tint',0);if(tint)hex=hex.match(/../g).map(v=>{const x=parseInt(v,16);return Math.round(tint<0?x*(1+tint):x+(255-x)*tint).toString(16).padStart(2,'0');}).join('');
  return '#'+hex;
}
async function stylesFor(result){
  const document=parseXml(await result.zip.file('xl/styles.xml').async('string')),root=document.documentElement;
  let theme=['FFFFFF','000000','EEECE1','1F497D','4F81BD','C0504D','9BBB59','8064A2','4BACC6','F79646'];
  if(result.zip.file('xl/theme/theme1.xml')){
    const t=parseXml(await result.zip.file('xl/theme/theme1.xml').async('string')),scheme=Array.from(t.getElementsByTagName('*')).find(n=>n.localName==='clrScheme');
    if(scheme){const entries=Array.from(scheme.children);theme=['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'].map(name=>{const e=entries.find(n=>n.localName===name)?.firstElementChild;return e?.getAttribute('lastClr')||e?.getAttribute('val')||'000000';});}
  }
  const fonts=list(node(root,'fonts'),'font'),fills=list(node(root,'fills'),'fill'),borders=list(node(root,'borders'),'border');
  return list(node(root,'cellXfs'),'xf').map(xf=>{
    const font=fonts[number(xf,'fontId',0)],fill=node(fills[number(xf,'fillId',0)],'patternFill'),border=borders[number(xf,'borderId',0)],alignment=node(xf,'alignment');
    const active=tag=>node(font,tag)&&!['0','false'].includes(node(font,tag).getAttribute('val'));
    return {font:node(font,'name')?.getAttribute('val')||'Calibri',size:number(node(font,'sz'),'val',11),bold:!!active('b'),italic:!!active('i'),underline:!!active('u'),text:color(node(font,'color'),theme),fill:fill?.getAttribute('patternType')==='solid'?color(node(fill,'fgColor'),theme,'#ffffff'):null,horizontal:alignment?.getAttribute('horizontal')||'general',vertical:alignment?.getAttribute('vertical')||'bottom',wrap:alignment?.getAttribute('wrapText')==='1',indent:number(alignment,'indent',0),rotation:number(alignment,'textRotation',0),borders:Object.fromEntries(['left','right','top','bottom'].map(side=>{const b=node(border,side);return [side,b?.hasAttribute('style')?{style:b.getAttribute('style'),color:color(node(b,'color'),theme)}:null];}))};
  });
}
function fontString(style){return `${style.italic?'italic ':''}${style.bold?'bold ':''}${style.size}px "${style.font.replace(/["\\]/g,'')}", "Carlito", Arial, sans-serif`;}
function printedText(cell){
  if(!cell||cell.v===undefined)return '';
  const text=XLSX.utils.format_cell(cell);
  // Match the supplied Contech print reference; never change numeric cell values.
  if(cell.t==='n'&&!XLSX.SSF.is_date(cell.z||'General'))return text.replace(/\d[\d,.]*/g,v=>v.replace(/[.,]/g,c=>c==='.'?',':'.'));
  return text;
}
function linesFor(ctx,text,width){
  const lines=[];
  for(const paragraph of text.split(/\r?\n/)){
    if(!paragraph){lines.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/)){
      if(ctx.measureText(word).width>width){
        if(line){lines.push(line);line='';}
        for(const character of word){if(line&&ctx.measureText(line+character).width>width){lines.push(line);line='';}line+=character;}
      }else if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;
    }
    lines.push(line);
  }
  return lines;
}
function createCanvas(width,height,scale=3){const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='white';ctx.fillRect(0,0,width,height);return {canvas,ctx};}
function rowPosition(sheet){const rows=new Map(elements(sheet,'row').map(r=>[Number(r.getAttribute('r'))-1,r]));return rows;}
export async function planFinalPdf(result){
  await preparePdf();await document.fonts.ready;
  const styles=await stylesFor(result),measure=document.createElement('canvas').getContext('2d'),pages=[];
  const headerWidth=744;measure.font='10px Arial';
  let headerLines=linesFor(measure,result.name,headerWidth-200);const top=34+Math.max(1,headerLines.length)*12+16,bottom=36,availableHeight=612-top-bottom;
  if(availableHeight<120)throw new Error('El nombre del libro es demasiado largo para el encabezado de la página.');
  for(const sheetName of result.sheets){
    const doc=result.docs.get(sheetName),sheet=result.workbook.Sheets[sheetName],range=contentBounds(doc),rows=rowPosition(doc),format=elements(doc,'sheetFormatPr')[0];
    const cols=elements(doc,'col'),widths=[];
    for(let c=range.s.c;c<=range.e.c;c++){
      const col=cols.find(n=>Number(n.getAttribute('min'))<=c+1&&Number(n.getAttribute('max'))>=c+1);
      widths.push(col?.getAttribute('hidden')==='1'?0:(number(col,'width',number(format,'defaultColWidth',8.43))*7+5)*.75);
    }
    const width=widths.reduce((a,b)=>a+b,0),scale=Math.min(1,744/width),heights=[];
    if(!width)throw new Error(`Todas las columnas de «${sheetName}» están ocultas.`);
    for(let r=range.s.r;r<=range.e.r;r++){const row=rows.get(r);heights.push(row?.getAttribute('hidden')==='1'?0:number(row,'ht',number(format,'defaultRowHeight',15)));}
    const x=[0],y=[0];for(const v of widths)x.push(x.at(-1)+v);
    const merges=elements(doc,'mergeCell').map(n=>XLSX.utils.decode_range(n.getAttribute('ref'))),cells=[];
    for(const element of elements(doc,'c')){
      const address=element.getAttribute('r'),at=XLSX.utils.decode_cell(address);if(at.c<range.s.c||at.c>range.e.c||at.r<range.s.r||at.r>range.e.r)continue;
      const merge=merges.find(m=>at.r>=m.s.r&&at.r<=m.e.r&&at.c>=m.s.c&&at.c<=m.e.c);
      if(merge&&(at.r!==merge.s.r||at.c!==merge.s.c))continue;
      const end=merge?.e||at,ci=at.c-range.s.c,ri=at.r-range.s.r,style=styles[number(element,'s',0)]||styles[0];
      if(style.rotation)throw new Error(`«${sheetName}» contiene texto girado en ${address}. Ajusta esa celda antes de generar el PDF.`);
      const w=x[end.c-range.s.c+1]-x[ci];if(!w||heights[ri]===0)continue;
      const text=printedText(sheet[address]);measure.font=fontString(style);
      const padding=2+style.indent*style.size*.7,lines=linesFor(measure,text,Math.max(1,w-2*padding)),needed=Math.max(style.size*1.2*lines.length+4,heights[ri]);
      if(!merge||merge.s.r===merge.e.r)heights[ri]=Math.max(heights[ri],needed);
      else{const height=heights.slice(ri,end.r-range.s.r+1).reduce((a,b)=>a+b,0);if(needed>height)heights[end.r-range.s.r]+=needed-height;}
      cells.push({at,end,ci,ri,style,text,lines,padding,number:sheet[address]?.t==='n',merge});
    }
    for(const height of heights)y.push(y.at(-1)+height);
    const rowGroups=[];let r=range.s.r;
    while(r<=range.e.r){let end=r;let extended=true;while(extended){extended=false;for(const merge of merges)if(merge.s.r<=end&&merge.e.r>=r&&merge.e.r>end){end=merge.e.r;extended=true;}}rowGroups.push({start:r,end:Math.min(end,range.e.r)});r=end+1;}
    let start=range.s.r,end=start-1,height=0;
    const push=()=>{if(end<start)return;pages.push({sheetName,range,styles,cells,widths,heights,x,y,width,scale,start,end,top,headerLines,doc});};
    for(const group of rowGroups){const h=y[group.end-range.s.r+1]-y[group.start-range.s.r];if(h*scale>availableHeight)throw new Error(`El contenido de una fila combinada de «${sheetName}» supera la altura de una página. Divide su texto o la combinación en la VM.`);if(height&& (height+h)*scale>availableHeight){push();start=group.start;height=0;}end=group.end;height+=h;}
    push();
  }
  return {pages,top};
}
function border(ctx,b,x1,y1,x2,y2){
  if(!b)return;ctx.save();ctx.strokeStyle=b.color;ctx.lineWidth={hair:.25,thin:.5,medium:1,thick:1.5,double:.5}[b.style]||.5;
  if(/dash/i.test(b.style))ctx.setLineDash([3,2]);if(/dot/i.test(b.style))ctx.setLineDash([.5,1]);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  if(b.style==='double'){ctx.beginPath();ctx.moveTo(x1+(x1===x2?1.5:0),y1+(y1===y2?1.5:0));ctx.lineTo(x2+(x1===x2?1.5:0),y2+(y1===y2?1.5:0));ctx.stroke();}ctx.restore();
}
async function drawingImages(result,page,ctx,originY){
  const ns='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',a='http://schemas.openxmlformats.org/drawingml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  // Resolve the drawing through the worksheet relationship, not sheet indices.
  const workbook=parseXml(await result.zip.file('xl/workbook.xml').async('string')),bookRels=parseXml(await result.zip.file('xl/_rels/workbook.xml.rels').async('string'));
  const s=elements(workbook,'sheet').find(n=>n.getAttribute('name')===page.sheetName),sheetRel=Array.from(bookRels.documentElement.children).find(n=>n.getAttribute('Id')===s.getAttributeNS(r,'id'));
  const resolve=(base,target)=>{const parts=(target.startsWith('/')?target.slice(1):base.slice(0,base.lastIndexOf('/')+1)+target).split('/'),out=[];for(const p of parts){if(p==='..')out.pop();else if(p!=='.'&&p)out.push(p);}return out.join('/');};
  const path=resolve('xl/workbook.xml',sheetRel.getAttribute('Target')),relsPath=path.replace(/([^/]+)$/,'_rels/$1.rels');
  if(!result.zip.file(relsPath))return;
  const rels=parseXml(await result.zip.file(relsPath).async('string'));
  for(const drawing of elements(page.doc,'drawing')){
    const relation=Array.from(rels.documentElement.children).find(n=>n.getAttribute('Id')===drawing.getAttributeNS(r,'id'));if(!relation)continue;
    const drawingPath=resolve(path,relation.getAttribute('Target')),xml=parseXml(await result.zip.file(drawingPath).async('string'));
    for(const anchor of Array.from(xml.documentElement.children)){
      const pic=anchor.getElementsByTagNameNS(ns,'pic')[0];if(!pic)throw new Error(`«${page.sheetName}» contiene un gráfico u objeto que debe imprimirse desde Excel. La VF de esta app admite tablas e imágenes.`);
      const from=anchor.getElementsByTagNameNS(ns,'from')[0],get=name=>Number(from?.getElementsByTagNameNS(ns,name)[0]?.textContent||0),row=get('row'),col=get('col');if(row<page.start||row>page.end)continue;
      const drawingRelsPath=drawingPath.replace(/([^/]+)$/,'_rels/$1.rels'),dr=parseXml(await result.zip.file(drawingRelsPath).async('string')),id=pic.getElementsByTagNameNS(a,'blip')[0].getAttributeNS(r,'embed'),rel=Array.from(dr.documentElement.children).find(n=>n.getAttribute('Id')===id),imagePath=resolve(drawingPath,rel.getAttribute('Target'));
      const ext=pic.getElementsByTagNameNS(a,'ext')[0],width=Number(ext?.getAttribute('cx')||0)/12700,height=Number(ext?.getAttribute('cy')||0)/12700;
      const raw=await result.zip.file(imagePath).async('base64'),image=new Image();image.src=`data:image/${/\.jpe?g$/i.test(imagePath)?'jpeg':'png'};base64,${raw}`;await image.decode();
      ctx.drawImage(image,page.x[col-page.range.s.c]+get('colOff')/12700,page.y[row-page.range.s.r]-originY+get('rowOff')/12700,width,height);
    }
  }
}
export async function buildFinalPdf(result,onProgress=()=>{}){
  const plan=await planFinalPdf(result),images=[],total=plan.pages.length;
  for(const [index,page] of plan.pages.entries()){
    onProgress(`Preparando PDF: página ${index+1} de ${total}…`);
    const {canvas,ctx}=createCanvas(792,612);ctx.font='10px Arial';ctx.fillStyle='#000';ctx.textBaseline='top';
    page.headerLines.forEach((line,i)=>ctx.fillText(line,24,22+i*12));ctx.textAlign='right';ctx.fillText(page.sheetName,768,22);ctx.fillText(`${index+1} de ${total}`,768,584);ctx.textAlign='left';
    ctx.save();ctx.translate(24,page.top);ctx.scale(page.scale,page.scale);const originY=page.y[page.start-page.range.s.r];
    const cells=page.cells.filter(c=>c.at.r>=page.start&&c.end.r<=page.end);
    for(const c of cells){const x=page.x[c.ci],y=page.y[c.ri]-originY,w=page.x[c.end.c-page.range.s.c+1]-x,h=page.y[c.end.r-page.range.s.r+1]-page.y[c.ri];if(c.style.fill){ctx.fillStyle=c.style.fill;ctx.fillRect(x,y,w,h);}}
    for(const c of cells){
      const x=page.x[c.ci],y=page.y[c.ri]-originY,w=page.x[c.end.c-page.range.s.c+1]-x,h=page.y[c.end.r-page.range.s.r+1]-page.y[c.ri],style=c.style;
      ctx.font=fontString(style);ctx.fillStyle=style.text;ctx.textBaseline='top';const align=style.horizontal==='general'?(c.number?'right':'left'):style.horizontal;
      ctx.textAlign=['left','center','right'].includes(align)?align:'left';const textX=align==='center'?x+w/2:align==='right'?x+w-c.padding:x+c.padding;
      const textH=c.lines.length*style.size*1.2,textY=style.vertical==='center'?y+(h-textH)/2:style.vertical==='top'?y+2:y+h-textH-2;
      c.lines.forEach((line,i)=>{ctx.fillText(line,textX,textY+i*style.size*1.2);if(style.underline){const tw=ctx.measureText(line).width,tx=align==='right'?textX-tw:align==='center'?textX-tw/2:textX;ctx.fillRect(tx,textY+(i+1)*style.size*1.2-1,tw,.5);}});
      // Excel stores the right/bottom edges of a merged cell in its last cell.
      let edges=style.borders;
      if(c.merge){const last=elements(page.doc,'c').find(n=>n.getAttribute('r')===XLSX.utils.encode_cell(c.end));const lastStyle=page.styles[number(last,'s',0)];if(lastStyle)edges={...edges,right:lastStyle.borders.right||edges.right,bottom:lastStyle.borders.bottom||edges.bottom};}
      border(ctx,edges.top,x,y,x+w,y);border(ctx,edges.bottom,x,y+h,x+w,y+h);border(ctx,edges.left,x,y,x,y+h);border(ctx,edges.right,x+w,y,x+w,y+h);
    }
    await drawingImages(result,page,ctx,originY);ctx.restore();images.push(canvas.toDataURL('image/png'));canvas.width=canvas.height=1;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  const document={pageSize:'LETTER',pageOrientation:'landscape',pageMargins:[0,0,0,0],info:{title:result.name,author:'Contech'},compress:true,content:images.map((image,i)=>({image,width:792,height:612,margin:0,pageBreak:i?'before':undefined}))};
  const pdf=await new Promise((resolve,reject)=>{try{pdfMake.createPdf(document).getBlob(resolve);}catch(error){reject(error);}});
  return {pdf,pages:total,pageSheets:plan.pages.map(p=>p.sheetName)};
}
