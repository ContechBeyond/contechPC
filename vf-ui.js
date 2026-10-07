import {sheetReference} from './core.js';
import {convertMatrix,exportTitle} from './vf-core.js';
import {buildFinalPdf} from './vf-pdf.js';
import {downloadBlob} from './exporters.js';
import {openPdfPreview} from './preview.js';
const $=id=>document.getElementById(id),MAX_FILE=10*1024*1024;
export function initFinalVersion(proposalToken=()=>null){
  let result=null,busy=false,token=null,tokenExpires=0;
  function tabs(ids,views,index){for(let i=0;i<ids.length;i++){const button=$(ids[i]);button.classList.toggle('active',i===index);button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;$(views[i]).hidden=i!==index;}}
  function connectTabs(ids,views){ids.forEach((id,index)=>{$(id).addEventListener('click',()=>tabs(ids,views,index));$(id).addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?ids.length-1:(index+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;tabs(ids,views,next);$(ids[next]).focus();});});}
  connectTabs(['proposal-section-tab','vf-section-tab'],['proposal-view','vf-view']);connectTabs(['vf-file-tab','vf-sheets-tab'],['vf-file-pane','vf-sheets-pane']);
  function error(message){$('vf-error').textContent=message;$('vf-error').hidden=!message;}
  function progress(message){$('vf-progress').textContent=message;$('vf-progress').hidden=!message;}
  function lock(value){busy=value;$('vf-view').setAttribute('aria-busy',String(value));for(const id of ['vf-file','vf-import-sheets','vf-connect-google','vf-sheet-url'])$(id).disabled=value;for(const id of ['vf-preview','vf-download-excel','vf-download-pdf'])$(id).disabled=value||!result;}
  function resetResult(){result=null;$('vf-result-data').hidden=true;$('vf-empty').hidden=false;lock(busy);}
  async function prepare(buffer,title){
    const converted=await convertMatrix(buffer,title,progress),pdf=await buildFinalPdf(converted,progress);result={...converted,...pdf};
    $('vf-final-name').textContent=result.name;$('vf-sheet-list').replaceChildren();
    for(const sheet of result.sheets){const item=document.createElement('li'),name=document.createElement('span'),count=document.createElement('small');name.textContent=sheet;const pages=result.pageSheets.filter(n=>n===sheet).length;count.textContent=pages===1?'1 página':`${pages} páginas`;item.append(name,count);$('vf-sheet-list').append(item);}
    $('vf-validation-summary').textContent=`${result.checkedValues} celdas verificadas · ${result.preservedFormulas} fórmulas conservadas · PDF de ${result.pages} ${result.pages===1?'página':'páginas'}.`;
    $('vf-conversion-details').textContent=`${result.frozen} ${result.frozen===1?'celda que dependía':'celdas que dependían'} de hojas retiradas ${result.frozen===1?'conservada':'conservadas'} como valores en su posición original. Hojas retiradas: ${result.removed.length?result.removed.join(', '):'ninguna'}.`;
    $('vf-empty').hidden=true;$('vf-result-data').hidden=false;progress('');
  }
  async function readFile(file){
    if(busy)return;resetResult();error('');lock(true);
    try{if(!/\.xlsx$/i.test(file.name))throw new Error('Carga un archivo Excel (.xlsx).');if(file.size>MAX_FILE)throw new Error('El archivo supera 10 MB.');progress('Leyendo el archivo Excel…');await prepare(await file.arrayBuffer(),file.name);}
    catch(e){error(e.message||'No se pudo preparar la versión final.');progress('');}finally{lock(false);$('vf-file').value='';}
  }
  $('vf-file').addEventListener('change',e=>{if(e.target.files[0])readFile(e.target.files[0]);});
  for(const event of ['dragenter','dragover'])$('vf-dropzone').addEventListener(event,e=>{e.preventDefault();if(!busy)$('vf-dropzone').classList.add('dragging');});
  for(const event of ['dragleave','drop'])$('vf-dropzone').addEventListener(event,e=>{e.preventDefault();$('vf-dropzone').classList.remove('dragging');});
  $('vf-dropzone').addEventListener('drop',e=>{if(e.dataTransfer.files[0])readFile(e.dataTransfer.files[0]);});
  $('vf-import-sheets').addEventListener('click',async()=>{
    if(busy)return;resetResult();error('');lock(true);
    try{
      const ref=sheetReference($('vf-sheet-url').value.trim());if(ref.published)throw new Error('Pega el enlace del libro completo (/spreadsheets/d/…). Un enlace publicado puede incluir solamente una pestaña.');
      progress('Leyendo el título y el libro de Google Sheets…');
      const activeToken=Date.now()<tokenExpires?token:proposalToken(),headers=activeToken?{Authorization:'Bearer '+activeToken}:{};
      const response=await fetch(`https://docs.google.com/spreadsheets/d/${ref.id}/export?format=xlsx`,{credentials:'omit',headers});
      if(!response.ok)throw new Error('No se pudo leer el libro. Conecta Google si es privado, o descárgalo como Excel y cárgalo aquí.');
      let title=exportTitle(response.headers.get('Content-Disposition'));
      if(!title){const metadata=await fetch(`https://docs.google.com/spreadsheets/d/${ref.id}/htmlview`,{credentials:'omit',headers});if(metadata.ok){const doc=new DOMParser().parseFromString(await metadata.text(),'text/html');title=doc.querySelector('title')?.textContent?.replace(/ - Google Drive$/,'');}}
      if(!title)throw new Error('No se pudo obtener el título original de Google Sheets. Descarga el Excel para conservar su nombre.');
      const buffer=await response.arrayBuffer();if(buffer.byteLength>MAX_FILE)throw new Error('El libro supera 10 MB.');if(/^\s*</.test(new TextDecoder().decode(buffer.slice(0,250))))throw new Error('Google solicita acceso a este libro. Conecta Google o carga el archivo Excel.');
      await prepare(buffer,title);
    }catch(e){error(e instanceof TypeError?'No se pudo acceder al libro de Google Sheets. Carga su archivo Excel o revisa el acceso al enlace.':e.message);progress('');}finally{lock(false);}
  });
  $('vf-connect-google').addEventListener('click',async()=>{
    error('');try{
      const clientId=window.CONTECH_CONFIG?.googleClientId;if(!clientId)throw new Error('La conexión con Google aún debe habilitarse en la app. Los enlaces públicos y la carga de Excel ya están disponibles.');
      if(!window.google?.accounts?.oauth2)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>reject(new Error('No se pudo abrir Google.'));document.head.appendChild(script);});
      const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',callback:response=>{if(response.error){error('No se autorizó la lectura de Google Sheets.');return;}token=response.access_token;tokenExpires=Date.now()+Math.max(0,Number(response.expires_in)-60)*1000;$('vf-connect-google').textContent='Google conectado';},error_callback:()=>error('Se cerró la conexión con Google. Puedes volver a intentarlo.')});client.requestAccessToken({prompt:token?'':'consent'});
    }catch(e){error(e.message);}
  });
  $('vf-download-excel').addEventListener('click',()=>{if(result&&!busy)downloadBlob(result.excel,result.name+'.xlsx');});
  $('vf-download-pdf').addEventListener('click',()=>{if(result&&!busy)downloadBlob(result.pdf,result.name+'.pdf');});
  $('vf-preview').addEventListener('click',async()=>{if(!result||busy)return;try{await openPdfPreview(result.pdf,result.name,result.name+'.pdf');}catch(e){error(e.message);}});
}
