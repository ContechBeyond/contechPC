import {COLUMN_FIELDS,headerColumns,identifyHeaders,rankSheets,normalize,importMatrix,validateRows,money,cents,multipliedCents,editableMoney,todayMexico,lastDayOfMonth,coverDate,sheetReference} from './core.js';
import {getDefaults,buildWordBlob,buildPdfBlob,downloadBlob,downloadName} from './exporters.js';
import {openPdfPreview,clearPreview} from './preview.js';
import {initFinalVersion} from './vf-ui.js';
const $=id=>document.getElementById(id);
const ICONS={upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',sheet:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h8M11 11v7"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 8a7 7 0 0 1 11.8-3L20 8M4 16l2.6 3A7 7 0 0 0 18.4 16"/>',check:'<path d="m5 12 4 4L19 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v1"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6"/>',trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state={rows:[],declaredTotal:null,acceptedDifferences:new Map(),workbook:null,workbookSource:'Archivo',matrix:null,source:'',pending:null,defaults:null,busy:false,revision:0,pdf:null,googleToken:null,googleMetadata:null};
function notice(message,error=false){$('notice').hidden=!message;$('notice').classList.toggle('error',error);$('notice').textContent=message;if(error)$('notice').scrollIntoView({block:'nearest',behavior:'smooth'});}
function importError(error){$('import-error').textContent=error.message||String(error);$('import-error').hidden=false;}
function formData(){return {project:$('project').value.trim(),client:$('client').value.trim(),folio:$('folio').value.trim(),recipient:$('recipient').value.trim(),issueDate:$('issue-date').value,expiryDate:$('expiry-date').value,technical:$('technical').value.trim(),commercial:$('commercial').value.trim()};}
function validationResult(){return validateRows(state.rows,state.declaredTotal,state.acceptedDifferences);}
function currentData(){const validation=validationResult();return {...formData(),total:validation.total,rows:state.rows.map(row=>({...row,unitCents:cents(row.unitPrice),amountCents:cents(row.amount)}))};}
function requiredIssues(){const d=formData();const out=[];if(!d.project)out.push('proyecto');if(!d.client)out.push('cliente');if(!d.folio)out.push('folio');if(!d.issueDate||!d.expiryDate)out.push('fechas');if(!d.technical)out.push('consideraciones técnicas');if(!d.commercial)out.push('consideraciones comerciales');if(d.issueDate&&d.expiryDate<d.issueDate)out.push('vigencia posterior o igual a la emisión');return out;}
function update(invalidate=true){
  if(invalidate){state.revision++;state.pdf=null;}
  const validation=validationResult(),missing=requiredIssues(),ready=validation.valid&&missing.length===0;
  $('preview-project').textContent=$('project').value.trim()||'Nombre del proyecto';$('preview-client').textContent=$('client').value.trim()||'Nombre del cliente';$('preview-folio').textContent=$('folio').value.trim()?'Folio: '+$('folio').value.trim():'Folio pendiente';$('preview-date').textContent=coverDate($('issue-date').value);
  $('summary-total').textContent=money(validation.total);$('summary-count').textContent=String(state.rows.length);$('row-count').textContent=String(state.rows.length);
  for(const id of ['preview','download-word','download-pdf'])$(id).disabled=!ready||state.busy;
  const status=$('export-status');status.classList.toggle('ready',ready);status.classList.toggle('error',state.rows.length>0&&validation.issues.length>0);
  let message=state.busy?'Preparando el documento…':!state.rows.length?'Importa tus conceptos y completa los campos obligatorios.':validation.issues.length?'Revisa las diferencias indicadas en la tabla.':missing.length?'Completa: '+missing.join(', ')+'.':validation.acceptedDifferences.length?'Importes originales conservados. Lista para descargar.':'Importes validados. Lista para descargar.';
  status.innerHTML=icon(ready?'check':'info')+`<span>${escapeHtml(message)}</span>`;
  if(state.rows.length){
    if(validation.valid)$('validation').innerHTML=`<div class="validation-summary">${icon('check')}<span>${validation.acceptedDifferences.length?'Diferencias aceptadas. Se conservan los importes originales.':'Cantidades, precios e importes coinciden.'} Total sin IVA: <strong>${money(validation.total)}</strong>.</span></div>`;
    else $('validation').innerHTML=`<div class="validation-summary validation-warning">${icon('info')}<span>Hay ${validation.issues.length} ${validation.issues.length===1?'dato por revisar':'datos por revisar'}.</span></div><ul>${validation.issues.slice(0,12).map(i=>`<li>${escapeHtml(i.message)}</li>`).join('')}${validation.issues.length>12?'<li>Revisa también los otros conceptos marcados.</li>':''}</ul><div class="validation-actions">${validation.issues.some(i=>i.type==='mismatch')?'<button id="keep-original-amounts" type="button" class="text-button">Conservar importes originales e ignorar diferencias</button><button id="recalculate" type="button" class="text-button">Usar importes calculados de cantidad × precio</button>':''}${validation.issues.some(i=>i.type==='total')?'<button id="use-sum" type="button" class="text-button">Usar la suma de los conceptos como total</button>':''}</div>`;
    if(validation.acceptedDifferences.length)$('validation').innerHTML+=`<details class="accepted-differences"><summary>${validation.acceptedDifferences.length} ${validation.acceptedDifferences.length===1?'diferencia aceptada':'diferencias aceptadas'}</summary><ul>${validation.acceptedDifferences.slice(0,12).map(i=>`<li>${escapeHtml(i.message)}</li>`).join('')}</ul></details><button id="review-differences" type="button" class="text-button">Volver a revisar las diferencias</button>`;
    $('keep-original-amounts')?.addEventListener('click',()=>{for(const issue of validation.issues)if(issue.type==='mismatch')state.acceptedDifferences.set(issue.id,issue.signature);update();notice('Se aceptaron las diferencias de cálculo. Se conservarán los precios e importes originales en Word y PDF.');});
    $('review-differences')?.addEventListener('click',()=>{state.acceptedDifferences.clear();update();notice('Las diferencias de cálculo vuelven a estar pendientes de revisión.');});
    $('recalculate')?.addEventListener('click',()=>{state.rows.forEach(row=>{const result=multipliedCents(row.quantity,row.unitPrice);if(Number.isFinite(result))row.amount=editableMoney(result);});state.declaredTotal=null;state.acceptedDifferences.clear();renderRows();notice('Se actualizaron los importes con cantidad × precio y se recalculó el total.');});
    $('use-sum')?.addEventListener('click',()=>{state.declaredTotal=null;update();notice('Se utilizará la suma de los conceptos como total sin IVA.');});
    const invalidIds=new Set(validation.issues.map(i=>i.id));document.querySelectorAll('#rows tr').forEach(row=>row.classList.toggle('invalid',invalidIds.has(row.dataset.id)));
  }
}
function renderRows(){
  $('table-section').hidden=state.rows.length===0;$('manual-start').hidden=state.rows.length>0;
  $('rows').innerHTML=state.rows.map((row,index)=>`<tr data-id="${row.id}"><td class="row-number">${index+1}</td><td><input class="concept-name" data-field="concept" value="${escapeHtml(row.concept)}" aria-label="Concepto ${index+1}" placeholder="Nombre del concepto"><textarea data-field="description" aria-label="Descripción ${index+1}" placeholder="Descripción del equipo o servicio">${escapeHtml(row.description)}</textarea></td><td><input class="number-input" inputmode="decimal" data-field="quantity" value="${escapeHtml(row.quantity)}" aria-label="Cantidad ${index+1}"></td><td><input class="number-input" inputmode="decimal" data-field="unitPrice" value="${escapeHtml(row.unitPrice)}" aria-label="Precio unitario ${index+1}"></td><td><input class="number-input" inputmode="decimal" data-field="amount" value="${escapeHtml(row.amount)}" aria-label="Importe ${index+1}"></td><td><button class="icon-button remove-row" aria-label="Eliminar concepto ${index+1}" type="button">${icon('trash')}</button></td></tr>`).join('');
  update();
}
$('rows').addEventListener('input',event=>{const field=event.target.dataset.field;if(!field)return;const row=state.rows.find(r=>r.id===event.target.closest('tr').dataset.id);row[field]=event.target.value;if(['quantity','unitPrice','amount'].includes(field)){state.declaredTotal=null;state.acceptedDifferences.delete(row.id);}update();});
$('rows').addEventListener('click',event=>{const button=event.target.closest('.remove-row');if(!button)return;const id=button.closest('tr').dataset.id;state.rows=state.rows.filter(row=>row.id!==id);state.acceptedDifferences.delete(id);state.declaredTotal=null;renderRows();});
function addRow(){if(state.rows.length>=200){notice('La propuesta admite hasta 200 conceptos.',true);return;}state.rows.push({id:crypto.randomUUID(),concept:'',description:'',quantity:'1',unitPrice:'0,00',amount:'0,00'});state.declaredTotal=null;renderRows();$('rows').lastElementChild.querySelector('input').focus();}
$('manual-start').addEventListener('click',addRow);$('add-row').addEventListener('click',addRow);
for(const id of ['project','client','folio','recipient','issue-date','expiry-date','technical','commercial'])$(id).addEventListener('input',()=>{notice('');update();});
function sourceLabel(name){state.source=name;$('source-name').textContent=name;$('source-info').hidden=false;}
function adopt(imported,name){state.rows=imported.rows;state.declaredTotal=imported.declaredTotal;state.acceptedDifferences.clear();sourceLabel(name);$('import-error').hidden=true;renderRows();notice(`${state.rows.length} conceptos importados. Revisa la tabla antes de descargar.`);}
function columnLabel(index){let out='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;}
function renderMapping(){
  const sample=state.pending.matrix[state.pending.headerIndex]||[],detected=headerColumns(sample);
  const columns=state.pending.matrix.reduce((max,row)=>Math.max(max,row.length),0);
  $('mapping-fields').innerHTML=COLUMN_FIELDS.map(([field,label,required])=>`<label class="field"><span>${label}${required?' *':''}</span><select data-map="${field}"><option value="-1">${required?'Selecciona una columna':'No incluida'}</option>${Array.from({length:columns},(_,i)=>`<option value="${i}"${detected.map[field]===i?' selected':''}>${columnLabel(i)} · ${escapeHtml(String(sample[i]??'').slice(0,65)||'Sin encabezado')}</option>`).join('')}</select></label>`).join('');
}
function processMatrix(matrix,name){
  state.matrix=matrix;sourceLabel(name);
  const detected=identifyHeaders(matrix);
  if(detected?.candidates.length===1){adopt(importMatrix(matrix,detected.map,detected.index),name);return;}
  state.pending={matrix,name,headerIndex:detected?.score>=2?detected.index:0};
  $('mapping-table-label').hidden=(detected?.candidates.length||0)<2;
  $('mapping-table').innerHTML=(detected?.candidates||[]).map(table=>`<option value="${table.index}">Fila ${table.index+1} · ${table.itemCount} ${table.itemCount===1?'concepto':'conceptos'}</option>`).join('');
  $('mapping-header').max=Math.max(1,matrix.length);$('mapping-header').value=state.pending.headerIndex+1;
  $('mapping-help').textContent=detected?.candidates.length>1?'Se encontraron varias tablas. Elige cuál importar y confirma sus columnas.':'Confirma la fila de encabezados y relaciona las columnas con los datos de la propuesta.';
  $('mapping-error').hidden=true;
  renderMapping();
  $('mapping-dialog').showModal();
}
$('mapping-table').addEventListener('change',()=>{state.pending.headerIndex=Number($('mapping-table').value);$('mapping-header').value=state.pending.headerIndex+1;renderMapping();});
$('mapping-header').addEventListener('change',()=>{const index=Number($('mapping-header').value)-1;if(Number.isInteger(index)&&index>=0&&index<state.pending.matrix.length){state.pending.headerIndex=index;renderMapping();}});
$('apply-mapping').addEventListener('click',()=>{try{const index=Number($('mapping-header').value)-1;if(!Number.isInteger(index)||index<0||index>=state.pending.matrix.length)throw new Error('Indica una fila de encabezados que exista en la hoja.');const map=Object.fromEntries(Array.from(document.querySelectorAll('[data-map]')).map(select=>[select.dataset.map,Number(select.value)]));if(['concept','quantity','unitPrice'].some(field=>map[field]<0))throw new Error('Selecciona Concepto, Cantidad y Precio unitario.');if(new Set(Object.values(map).filter(v=>v>=0)).size!==Object.values(map).filter(v=>v>=0).length)throw new Error('Cada dato debe usar una columna diferente.');const result=importMatrix(state.pending.matrix,map,index);adopt(result,state.pending.name);$('mapping-dialog').close();}catch(error){$('mapping-error').textContent=error.message;$('mapping-error').hidden=false;}});
function worksheetMatrix(sheet){
  if(!sheet['!ref'])return [];
  const range=XLSX.utils.decode_range(sheet['!ref']);range.s={r:0,c:0};
  return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true,range});
}
function adoptWorkbook(workbook,name){
  state.workbook=workbook;state.workbookSource=name;state.googleMetadata=null;
  $('worksheet').innerHTML=workbook.SheetNames.map(title=>`<option>${escapeHtml(title)}</option>`).join('');$('worksheet-label').hidden=workbook.SheetNames.length<2;
  const sheets=workbook.SheetNames.map(title=>({name:title,matrix:worksheetMatrix(workbook.Sheets[title])}));
  const chosen=rankSheets(sheets)[0];if(!chosen)throw new Error('El archivo no contiene hojas.');
  $('worksheet').value=chosen.name;processMatrix(chosen.matrix,name+' · '+chosen.name);
}
async function readFile(file){
  try{notice('');$('import-error').hidden=true;if(file.size>10*1024*1024)throw new Error('El archivo supera 10 MB. Guarda únicamente la hoja con los conceptos e inténtalo de nuevo.');if(!/\.(xlsx|xls|csv|ods)$/i.test(file.name))throw new Error('Carga un archivo Excel, CSV u ODS. Un archivo .gsheet contiene un enlace; descárgalo como Excel desde Google Sheets.');
    adoptWorkbook(XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false}),file.name);
  }catch(error){importError(error);}
}
$('file').addEventListener('change',event=>{if(event.target.files[0])readFile(event.target.files[0]);});
for(const event of ['dragenter','dragover'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('dragging');});
$('dropzone').addEventListener('drop',e=>{const file=e.dataTransfer.files[0];if(file)readFile(file);});
function tab(name){for(const type of ['file','sheets']){$(type+'-tab').classList.toggle('active',type===name);$(type+'-tab').setAttribute('aria-selected',String(type===name));$(type+'-pane').hidden=type!==name;}}
$('file-tab').addEventListener('click',()=>tab('file'));$('sheets-tab').addEventListener('click',()=>tab('sheets'));
document.querySelectorAll('#file-tab,#sheets-tab').forEach(button=>button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const target=button.id==='file-tab'?'sheets':'file';tab(target);$(target+'-tab').focus();}}));
async function googleApi(path){const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+path,{headers:{Authorization:'Bearer '+state.googleToken}});if(!response.ok){if(response.status===401)state.googleToken=null;throw new Error(response.status===403?'La cuenta conectada no tiene acceso a esta hoja.':response.status===401?'La sesión de Google venció. Conecta tu cuenta otra vez.':'No se pudo leer la hoja de Google Sheets.');}return response.json();}
async function googleSheetMatrix(ref,name){const range=encodeURIComponent("'"+name.replace(/'/g,"''")+"'");const response=await googleApi(ref.id+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE');return response.values||[];}
async function importGoogleSheet(ref,name){processMatrix(await googleSheetMatrix(ref,name),state.googleMetadata.title+' · '+name);}
async function importSheets(){
  const button=$('import-sheets');button.disabled=true;button.textContent='Importando…';$('import-error').hidden=true;
  try{const ref=sheetReference($('sheet-url').value.trim());
    if(state.googleToken&&!ref.published){
      const meta=await googleApi(ref.id+'?fields=properties.title,sheets.properties');state.googleMetadata={ref,title:meta.properties.title,sheets:meta.sheets};state.workbook=null;
      $('worksheet').innerHTML=meta.sheets.map(s=>`<option>${escapeHtml(s.properties.title)}</option>`).join('');$('worksheet-label').hidden=meta.sheets.length<2;
      const cliente=meta.sheets.find(s=>normalize(s.properties.title)==='cliente');
      let chosen;
      if(cliente)chosen={name:cliente.properties.title,matrix:await googleSheetMatrix(ref,cliente.properties.title)};
      else{const sheets=[];for(const sheet of meta.sheets)sheets.push({name:sheet.properties.title,matrix:await googleSheetMatrix(ref,sheet.properties.title)});chosen=rankSheets(sheets)[0];}
      if(!chosen)throw new Error('La hoja de Google Sheets no contiene pestañas.');
      $('worksheet').value=chosen.name;processMatrix(chosen.matrix,meta.properties.title+' · '+chosen.name);
    }
    else{
      // Read the full workbook: a CSV query can omit mixed-type header cells.
      const url=ref.published?`https://docs.google.com/spreadsheets/d/e/${ref.id}/pub?gid=${encodeURIComponent(ref.gid)}&single=true&output=csv`:`https://docs.google.com/spreadsheets/d/${ref.id}/export?format=xlsx`;
      const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error('No se pudo abrir el enlace. Si la hoja es privada, conecta Google o carga el archivo Excel.');
      const buffer=await response.arrayBuffer();if(buffer.byteLength>10*1024*1024)throw new Error('La hoja supera 10 MB. Descarga solo los conceptos como Excel y carga ese archivo.');
      if(/^\s*</.test(new TextDecoder().decode(buffer.slice(0,300))))throw new Error('La hoja solicita acceso. Conecta Google o carga el archivo Excel.');
      adoptWorkbook(XLSX.read(buffer,{type:'array',cellDates:false,raw:true}),'Google Sheets');
    }
  }catch(error){importError(error instanceof TypeError?new Error('No se pudo leer el enlace. Si la hoja es privada, conecta Google o carga el archivo Excel.'):error);}finally{button.disabled=false;button.innerHTML=icon('sheet')+'Importar hoja';}
}
$('import-sheets').addEventListener('click',importSheets);
$('worksheet').addEventListener('change',async()=>{try{if(state.workbook)processMatrix(worksheetMatrix(state.workbook.Sheets[$('worksheet').value]),state.workbookSource+' · '+$('worksheet').value);else if(state.googleMetadata)await importGoogleSheet(state.googleMetadata.ref,$('worksheet').value);}catch(error){importError(error);}});
let googleClient;
$('connect-google').addEventListener('click',async()=>{
  try{const clientId=window.CONTECH_CONFIG?.googleClientId;if(!clientId){importError(new Error('La conexión con Google aún debe habilitarse para esta app. Mientras tanto, descarga tu hoja como Excel y cárgala en Archivo.'));return;}
    if(!window.google?.accounts?.oauth2)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>reject(new Error('No se pudo abrir la conexión con Google.'));document.head.appendChild(script);});
    googleClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',callback:response=>{if(response.error){importError(new Error('No se autorizó la lectura de Google Sheets.'));return;}state.googleToken=response.access_token;setTimeout(()=>state.googleToken=null,Math.max(0,(Number(response.expires_in)-60)*1000));$('connect-google').innerHTML=icon('check')+'Google conectado';$('google-help').textContent='Tu cuenta está conectada para leer las hojas a las que tengas acceso.';notice('Google conectado. Ya puedes importar una hoja privada por enlace.');},error_callback:()=>importError(new Error('Se cerró la conexión con Google. Puedes volver a intentarlo.'))});googleClient.requestAccessToken({prompt:state.googleToken?'':'consent'});
  }catch(error){importError(error);}
});
function resetDates(){const today=todayMexico();$('issue-date').value=today;$('expiry-date').value=lastDayOfMonth(today);}
$('restore-conditions').addEventListener('click',()=>{if(!state.defaults)return;$('technical').value=state.defaults.technical;$('commercial').value=state.defaults.commercial;update();notice('Se restauraron las condiciones habituales de Contech.');});
$('reset').addEventListener('click',()=>{if((state.rows.length||$('project').value||$('client').value)&&!confirm('¿Empezar una nueva propuesta? Se borrarán los datos de esta propuesta.'))return;state.rows=[];state.declaredTotal=null;state.acceptedDifferences.clear();state.workbook=null;state.matrix=null;state.pending=null;state.googleMetadata=null;for(const id of ['project','client','folio','sheet-url'])$(id).value='';$('recipient').value='Estimado cliente';$('technical').value=state.defaults?.technical||'';$('commercial').value=state.defaults?.commercial||'';$('file').value='';$('source-info').hidden=true;$('worksheet-label').hidden=true;$('import-error').hidden=true;resetDates();renderRows();notice('');window.scrollTo({top:0,behavior:'smooth'});});
async function exportDocument(type,preview=false){
  if(state.busy||requiredIssues().length||!validationResult().valid)return;
  const data=currentData();state.busy=true;update(false);notice('');
  try{
    const blob=type==='word'?await buildWordBlob(data):await buildPdfBlob(data);
    if(preview){state.pdf={blob,data};await openPdfPreview(blob,data.project+' · '+data.client+' · Folio '+data.folio,downloadName(data,'pdf'));}
    else downloadBlob(blob,downloadName(data,type==='word'?'docx':'pdf'));
  }catch(error){console.error(error);notice('No se pudo generar el documento. '+(error.message||'Revisa los datos e inténtalo de nuevo.'),true);}finally{state.busy=false;update(false);}
}
$('download-word').addEventListener('click',()=>exportDocument('word'));$('download-pdf').addEventListener('click',()=>exportDocument('pdf'));$('preview').addEventListener('click',()=>exportDocument('pdf',true));
$('close-preview').addEventListener('click',()=>$('preview-dialog').close());$('preview-dialog').addEventListener('close',()=>{clearPreview().catch(()=>{});});
initFinalVersion(()=>state.googleToken);
resetDates();update();
try{state.defaults=await getDefaults();$('technical').value=state.defaults.technical;$('commercial').value=state.defaults.commercial;update();}catch(error){notice('No se pudieron cargar las condiciones habituales. Recarga la página.',true);}
