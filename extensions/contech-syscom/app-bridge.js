(()=>{
  if(globalThis.contechSyscomAppBridge)return;globalThis.contechSyscomAppBridge=true;
  const channel='contech-syscom-v1',actions=new Set(['ping','search','select','cancel']);
  window.addEventListener('message',async event=>{
    const message=event.data;
    if(event.source!==window||event.origin!==location.origin||message?.channel!==channel||message.type!=='request'||!actions.has(message.action)||typeof message.id!=='string'||!/^[\w-]{8,64}$/.test(message.id))return;
    const request={action:message.action};
    if(message.action==='search'){if(typeof message.model!=='string'||message.model.length>100)return;request.model=message.model;}
    if(message.action==='select'){if(typeof message.token!=='string'||message.token.length>64||!Number.isInteger(message.index))return;request.token=message.token;request.index=message.index;}
    let result;try{result=await chrome.runtime.sendMessage(request);}catch{result={ok:false,error:{code:'disconnected',message:'La extensión se actualizó o se desconectó. Recarga la app.'}};}
    window.postMessage({channel,type:'response',id:message.id,result},location.origin);
  });
  window.postMessage({channel,type:'ready'},location.origin);
})();
