const CHANNEL='contech-syscom-v1';
export function createSyscomClient({window:win=window,origin=win.location.origin,onReady=()=>{}}={}){
  const pending=new Map();
  const listener=event=>{
    const message=event.data;if(event.source!==win||event.origin!==origin||message?.channel!==CHANNEL)return;
    if(message.type==='ready'){onReady();return;}
    if(message.type!=='response'||!pending.has(message.id))return;
    const request=pending.get(message.id);pending.delete(message.id);clearTimeout(request.timer);
    if(message.result?.ok)request.resolve(message.result.data);
    else{const error=new Error(message.result?.error?.message||'No se pudo consultar SYSCOM.');Object.assign(error,message.result?.error);request.reject(error);}
  };
  win.addEventListener('message',listener);
  function request(action,data={},timeout=75000){return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);const error=new Error(action==='ping'?'Instala la extensión y conecta esta app desde su icono.':'La extensión no respondió. Revisa SYSCOM y vuelve a consultar manualmente.');error.code=action==='ping'?'missing':'timeout';reject(error);},timeout);
    pending.set(id,{resolve,reject,timer});win.postMessage({channel:CHANNEL,type:'request',id,action,...data},origin);
  });}
  return {request,ping:()=>request('ping',{},1500),destroy(){win.removeEventListener('message',listener);for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('La conexión se cerró.'));}pending.clear();}};
}
