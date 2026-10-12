import {SYS_ORIGINS,appOrigin} from './shared.js';
const $=id=>document.getElementById(id);let activeTab,paused=false;
function notice(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function request(action,data={}){const result=await chrome.runtime.sendMessage({action,...data});if(!result?.ok)throw new Error(result?.error?.message||'No se pudo conectar la extensión.');return result.data;}
function render(state){paused=Boolean(state.paused);$('pause').textContent=paused?'Reanudar consultas':'Pausar consultas';$('origins').textContent=state.origins.length?'Apps conectadas: '+state.origins.join(', '):'Todavía no hay una app conectada.';if(state.paused)notice(state.paused,true);}
async function init(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});activeTab=tabs[0];
  try{$('app-url').value=appOrigin(activeTab?.url||'');}catch{}
  const state=await request('state');render(state);if(!$('app-url').value&&state.origins.length)$('app-url').value=state.origins.at(-1);
}
$('connect-form').addEventListener('submit',async event=>{
  event.preventDefault();$('connect').disabled=true;
  try{
    const origin=appOrigin($('app-url').value);
    const granted=await chrome.permissions.request({origins:[origin+'/*',...SYS_ORIGINS]});
    if(!granted){notice('Chrome no concedió el acceso. Puedes volver a conectar cuando lo desees.',true);return;}
    const state=await request('configure',{url:origin,tabId:activeTab?.id});render(state);notice('Conectada. En Crear matriz, escribe el modelo y pulsa Buscar en SYSCOM.');
  }catch(error){notice(error.message,true);}finally{$('connect').disabled=false;}
});
$('open-site').addEventListener('click',()=>request('open-site').catch(error=>notice(error.message,true)));
$('pause').addEventListener('click',async()=>{try{render(await request(paused?'resume':'pause'));if(!paused)notice('Consultas reanudadas. Los límites de consulta siguen activos.');}catch(error){notice(error.message,true);}});
init().catch(error=>notice(error.message,true));
