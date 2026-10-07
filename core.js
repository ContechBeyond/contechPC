export const COLUMN_FIELDS = [
  ['concept','Concepto',true],['description','Descripción',false],['quantity','Cantidad',true],['unitPrice','Precio unitario',true],['amount','Importe',false]
];
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function decimalString(value, kind='money') {
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:20}) : '';
  let s=String(value??'').trim().replace(/MXN|USD|M\.N\.|\$/gi,'').replace(/\s/g,'');
  if(!s) return '';
  if(/^\(.*\)$/.test(s)) s='-'+s.slice(1,-1);
  if(!/^[+-]?[\d.,]+$/.test(s)) return '';
  const dot=s.lastIndexOf('.'), comma=s.lastIndexOf(',');
  if(dot>=0 && comma>=0) { const decimal=dot>comma?'.':','; const thousands=decimal==='.'?',':'.'; s=s.split(thousands).join('').replace(decimal,'.'); }
  else if(comma>=0 || dot>=0) {
    const sep=comma>=0?',':'.';const parts=s.split(sep);
    if(parts.length>2) { if(parts.slice(1).every(p=>p.length===3))s=parts.join('');else return ''; }
    else if(parts[1].length===3 && kind==='money')s=parts.join('');
    else s=parts.join('.');
  }
  return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s)) ? s : '';
}
function decimalParts(value,kind) {
  const s=decimalString(value,kind);if(!s)return null;
  const negative=s.startsWith('-');const [whole,fraction='']=s.replace(/^[+-]/,'').split('.');
  if(fraction.length>20||whole.length>12)return null;
  return {coefficient:BigInt(whole+fraction)*(negative?-1n:1n),scale:fraction.length};
}
function roundToCents(coefficient,scale) {
  if(scale<=2)return Number(coefficient*10n**BigInt(2-scale));
  const divisor=10n**BigInt(scale-2);const sign=coefficient<0n?-1n:1n;const absolute=coefficient*sign;
  return Number(((absolute+divisor/2n)/divisor)*sign);
}
export function cents(value) {const p=decimalParts(value,'money');return p?roundToCents(p.coefficient,p.scale):NaN;}
export function multipliedCents(quantity,price) {const q=decimalParts(quantity,'quantity'),p=decimalParts(price,'money');return q&&p?roundToCents(q.coefficient*p.coefficient,q.scale+p.scale):NaN;}
export const money = amount => '$'+new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format((Number.isFinite(amount)?amount:0)/100);
export const editableMoney = amount => ((Number.isFinite(amount)?amount:0)/100).toFixed(2).replace('.',',');
export function validateRows(rows,declaredTotal=null,acceptedDifferences=new Map()) {
  const issues=[],accepted=[];let total=0;let calculatedTotal=0;
  rows.forEach((row,i)=>{
    const q=Number(decimalString(row.quantity,'quantity')),p=Number(decimalString(row.unitPrice)),a=cents(row.amount),expected=multipliedCents(row.quantity,row.unitPrice);
    if(!row.concept.trim())issues.push({row:i+1,id:row.id,type:'concept',message:`Concepto ${i+1}: falta el nombre.`});
    if(row.concept.length>180)issues.push({row:i+1,id:row.id,type:'concept',message:`Concepto ${i+1}: acorta el nombre a un máximo de 180 caracteres.`});
    if(!decimalString(row.quantity,'quantity')||q<=0||q>1000000)issues.push({row:i+1,id:row.id,type:'quantity',message:`Concepto ${i+1}: indica una cantidad mayor que cero y de hasta 1.000.000.`});
    if(!decimalString(row.unitPrice)||p<0||p>1000000000)issues.push({row:i+1,id:row.id,type:'price',message:`Concepto ${i+1}: revisa el precio unitario.`});
    if((decimalString(row.unitPrice).split('.')[1]||'').length>2)issues.push({row:i+1,id:row.id,type:'price',message:`Concepto ${i+1}: el precio unitario debe tener como máximo dos decimales.`});
    if(!Number.isSafeInteger(a)||a<0)issues.push({row:i+1,id:row.id,type:'amount',message:`Concepto ${i+1}: revisa el importe.`});
    if(Number.isFinite(expected)&&Number.isSafeInteger(a)&&a!==expected){
      const signature=JSON.stringify([row.quantity,row.unitPrice,row.amount]);
      const difference={row:i+1,id:row.id,type:'mismatch',signature,message:`Concepto ${i+1}: cantidad × precio = ${money(expected)}; el importe indica ${money(a)}.`};
      (acceptedDifferences.get(row.id)===signature?accepted:issues).push(difference);
    }
    if(row.description.length>2400)issues.push({row:i+1,id:row.id,type:'description',message:`Concepto ${i+1}: acorta la descripción a un máximo de 2.400 caracteres para conservar la fila completa.`});
    if(Number.isFinite(a))total+=a;
    if(Number.isFinite(expected))calculatedTotal+=expected;
  });
  if(declaredTotal!==null){
    if(!Number.isFinite(declaredTotal))issues.push({type:'total',message:'El total sin IVA del archivo no es un importe válido. Revisa la hoja o utiliza la suma de los conceptos.'});
    else if(total!==declaredTotal)issues.push({type:'total',message:`El archivo indica ${money(declaredTotal)} de total sin IVA; la suma de conceptos es ${money(total)}.`});
  }
  return {issues,acceptedDifferences:accepted,total,calculatedTotal,valid:rows.length>0&&issues.length===0};
}
const HEADER_ALIASES={
  concept:['concepto','conceptos','conceptodelservicio','conceptoservicio','equipo','equipos','producto','productos','servicio','servicios','articulo','articulos'],
  description:['descripcion','descripcionequipo','descripciondelproducto','descripciondelconcepto','descripciondelservicio','detalle','detalles','especificaciones'],
  quantity:['cantidad','cant','qty','quantity','piezas'],
  unitPrice:['preciounitario','punitario','pu','costounitario','unitprice','precio','unitario'],
  amount:['importe','importetotal','total','subtotal','montototal','amount']
};
const REQUIRED_COLUMNS=['concept','quantity','unitPrice'];
const filled=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
const completeHeader=header=>header&&!header.ambiguous&&REQUIRED_COLUMNS.every(field=>header.map[field]!==undefined);
export function headerColumns(row) {
  const matches={};
  row.forEach((cell,col)=>{
    const n=normalize(cell).replace(/(?:mxn|usd|pesos|mn)$/,'');
    for(const [field,aliases] of Object.entries(HEADER_ALIASES))if(aliases.includes(n))(matches[field]??=[]).push(col);
  });
  // Duplicated required headings can represent cost and selling prices. Ask for a mapping.
  const map={};for(const [field,cols] of Object.entries(matches))if(cols.length===1)map[field]=cols[0];
  return {map,score:Object.keys(matches).length,ambiguous:REQUIRED_COLUMNS.some(field=>(matches[field]?.length||0)>1)};
}
function footerKind(row,map) {
  if(filled(row[map.quantity])||filled(row[map.unitPrice]))return null;
  const labels=row.filter(value=>typeof value==='string').map(normalize);
  if(labels.some(label=>/^(?:totalsiniva|subtotalsiniva|subtotal)(?:mxn|pesos|mn)?$/.test(label)))return 'net';
  if(labels.some(label=>/^(?:total|totalconiva|totalgeneral|iva\d*|descuento|impuestos)(?:mxn|pesos|mn)?$/.test(label)))return 'end';
  return null;
}
function itemRow(row,map) {
  return ['quantity','unitPrice','amount'].some(field=>map[field]>=0&&filled(row[map[field]]));
}
function sameColumns(a,b) {return COLUMN_FIELDS.every(([field])=>(a[field]??-1)===(b[field]??-1));}
function tableExtent(matrix,map,index) {
  let itemCount=0,endIndex=matrix.length;
  for(let i=index+1;i<matrix.length;i++){
    const row=matrix[i]||[];
    if(footerKind(row,map)){endIndex=i+1;break;}
    const header=headerColumns(row);
    if(completeHeader(header)){
      if(sameColumns(map,header.map))continue;
      endIndex=i;break;
    }
    if(itemRow(row,map))itemCount++;
  }
  return {itemCount,endIndex};
}
export function identifyHeaders(matrix) {
  const found=[];let partial=null;
  matrix.forEach((row,index)=>{
    const header={...headerColumns(row||[]),index};
    if(!partial||header.score>partial.score)partial=header;
    if(completeHeader(header)){
      // A repeated heading inside the same table is not a second table.
      if(found.some(table=>index<table.endIndex&&sameColumns(table.map,header.map)))return;
      found.push({...header,...tableExtent(matrix,header.map,index)});
    }
  });
  const candidates=found.filter(table=>table.itemCount>0).sort((a,b)=>b.score-a.score||b.itemCount-a.itemCount||a.index-b.index);
  const best=candidates[0]||partial;
  return best?{...best,candidates}:null;
}
export function rankSheets(sheets) {
  return sheets.map(sheet=>{
    const header=identifyHeaders(sheet.matrix),name=normalize(sheet.name),hasData=sheet.matrix.some(row=>(row||[]).some(filled));
    const priority=hasData&&name==='cliente'?10000:completeHeader(header)&&header.itemCount>0?1000+(name.includes('cliente')?200:/cotizacion|propuesta/.test(name)?100:0):0;
    return {...sheet,header,score:priority+(header?.score||0)};
  }).sort((a,b)=>b.score-a.score);
}
export function importMatrix(matrix,mapping,headerIndex=0) {
  const rows=[];let declaredTotal=null;let skipped=0;
  for(const source of matrix.slice(headerIndex+1)) {
    if(source.every(value=>value===null||value===undefined||String(value).trim()===''))continue;
    const footer=footerKind(source,mapping);
    if(footer){
      if(footer==='net'){
        const mapped=cents(source[mapping.amount]);
        const candidates=source.slice().reverse().map(v=>cents(v)).filter(Number.isFinite);
        if(filled(source[mapping.amount]))declaredTotal=mapped;else if(candidates.length)declaredTotal=candidates[0];
      }
      break;
    }
    const header=headerColumns(source);
    if(completeHeader(header)) {if(sameColumns(mapping,header.map))continue;break;}
    if(!itemRow(source,mapping)){skipped++;continue;}
    const concept=String(source[mapping.concept]??'').trim();
    const quantity=decimalString(source[mapping.quantity],'quantity')||String(source[mapping.quantity]??'').trim();
    const parsedPrice=cents(source[mapping.unitPrice]);
    const unitPrice=Number.isFinite(parsedPrice)?editableMoney(parsedPrice):String(source[mapping.unitPrice]??'').trim();
    const description=mapping.description>=0?String(source[mapping.description]??'').trim():'';
    const sourceAmount=mapping.amount>=0?source[mapping.amount]:null;
    const amountProvided=sourceAmount!==null&&sourceAmount!==undefined&&String(sourceAmount).trim()!=='';
    const parsedAmount=mapping.amount>=0?cents(sourceAmount):NaN;
    const importedAmount=Number.isFinite(parsedAmount)?editableMoney(parsedAmount):'';
    const calculated=multipliedCents(quantity,unitPrice);
    const amount=amountProvided?(importedAmount||String(sourceAmount)):(Number.isFinite(calculated)?editableMoney(calculated):'');
    rows.push({id:crypto.randomUUID(),concept,description,quantity,unitPrice,amount});
  }
  if(rows.length>200)throw new Error('El archivo contiene más de 200 conceptos. Divide la propuesta para poder revisarla y generarla.');
  if(!rows.length)throw new Error('No se encontraron conceptos en la hoja seleccionada. Revisa las columnas y la hoja de origen.');
  return {rows,declaredTotal,skipped};
}
export function todayMexico() {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function lastDayOfMonth(iso) {const [y,m]=iso.split('-').map(Number);return `${y}-${String(m).padStart(2,'0')}-${new Date(y,m,0).getDate()}`;}
export function longDate(iso) {if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return '';return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric'}).format(new Date(iso+'T12:00:00'));}
export function coverDate(iso) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return '';
  const parts=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric'}).formatToParts(new Date(iso+'T12:00:00'));
  const month=parts.find(part=>part.type==='month').value,year=parts.find(part=>part.type==='year').value;
  return month[0].toUpperCase()+month.slice(1)+' '+year;
}
export function sheetReference(url) {
  let parsed;try{parsed=new URL(url);}catch{throw new Error('Pega un enlace válido de Google Sheets.');}
  if(parsed.hostname!=='docs.google.com')throw new Error('El enlace debe pertenecer a Google Sheets (docs.google.com).');
  const id=parsed.pathname.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/)?.[1];
  if(!id)throw new Error('No se encontró la hoja en ese enlace.');
  const gid=parsed.searchParams.get('gid')||new URLSearchParams(parsed.hash.slice(1)).get('gid')||'0';
  return {id,gid,published:parsed.pathname.includes('/d/e/')};
}
export const conditionLines = text => String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
export const fileName = data => `Propuesta comercial ${data.client} - ${data.project} ${data.folio}`.replace(/[<>:"/\\|?*\u0000-\u001F]/g,'').trim();
