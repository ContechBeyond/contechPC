import {downloadBlob} from './exporters.js';
let library,documentTask,pdfDocument,renderTask,currentDownload,generation=0,pageNumber=1,expanded=false;
const $=id=>document.getElementById(id);
async function pdfLibrary(){
  if(!library)library=import('./vendor/pdf.module.js').then(module=>{module.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.module.js',import.meta.url).href;return module;}).catch(error=>{library=null;throw error;});
  return library;
}
async function renderPage(){
  if(!pdfDocument)return;
  const version=generation;
  $('preview-page').textContent=`Página ${pageNumber} de ${pdfDocument.numPages}`;
  $('preview-previous').disabled=true;$('preview-next').disabled=true;
  if(renderTask){renderTask.cancel();try{await renderTask.promise;}catch{}renderTask=null;}
  const page=await pdfDocument.getPage(pageNumber);if(version!==generation)return;
  const canvas=$('preview-canvas'),base=page.getViewport({scale:1});
  const fitWidth=Math.max(220,$('pdf-preview').clientWidth-32)/base.width,fitHeight=Math.max(220,$('pdf-preview').clientHeight-32)/base.height;
  const scale=Math.min(1.3,fitWidth,expanded?1.3:fitHeight),viewport=page.getViewport({scale});
  const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
  canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';canvas.hidden=false;
  renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});
  try{await renderTask.promise;}catch(error){if(error.name!=='RenderingCancelledException')throw error;}
  if(version===generation){$('preview-message').hidden=true;renderTask=null;$('pdf-preview').scrollTop=0;$('preview-previous').disabled=pageNumber<=1;$('preview-next').disabled=pageNumber>=pdfDocument.numPages;}
}
export async function showPdf(blob){
  await clearPreview();const version=generation;
  $('preview-message').textContent='Cargando vista previa…';$('preview-message').hidden=false;
  try{const module=await pdfLibrary();if(version!==generation)return;
    documentTask=module.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false});
    pdfDocument=await documentTask.promise;if(version!==generation)return;
    pageNumber=1;expanded=false;$('preview-zoom').textContent='Ampliar';await renderPage();
  }catch(error){if(version!==generation)return;$('preview-message').textContent='No se pudo mostrar la vista previa. Puedes descargar el PDF para revisarlo.';$('preview-message').hidden=false;throw error;}
}
export async function clearPreview(){
  currentDownload=null;
  generation++;if(renderTask){renderTask.cancel();renderTask=null;}
  const task=documentTask;documentTask=null;pdfDocument=null;pageNumber=1;
  $('preview-canvas').hidden=true;$('preview-page').textContent='';$('preview-previous').disabled=true;$('preview-next').disabled=true;
  if(task)await task.destroy();
}
export async function openPdfPreview(blob,title,name){
  $('preview-dialog-name').textContent=title;$('preview-dialog').showModal();
  try{await showPdf(blob);}finally{currentDownload={blob,name};}
}
$('preview-download').addEventListener('click',()=>{if(currentDownload)downloadBlob(currentDownload.blob,currentDownload.name);});
for(const [id,step] of [['preview-previous',-1],['preview-next',1]])$(id).addEventListener('click',async()=>{
  if(!pdfDocument)return;pageNumber=Math.max(1,Math.min(pdfDocument.numPages,pageNumber+step));
  try{await renderPage();}catch{ $('preview-message').textContent='No se pudo mostrar esta página.';$('preview-message').hidden=false; }
});
$('preview-zoom').addEventListener('click',async()=>{if(!pdfDocument||renderTask)return;expanded=!expanded;$('preview-zoom').textContent=expanded?'Ajustar a página':'Ampliar';try{await renderPage();}catch{ $('preview-message').textContent='No se pudo ajustar esta página.';$('preview-message').hidden=false; }});
