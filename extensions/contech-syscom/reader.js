(()=>{
  if(globalThis.contechSyscomReaderInstalled)return;globalThis.contechSyscomReaderInstalled=true;
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||message?.type!=='syscom-read')return;
    const parser=globalThis.ContechSyscomDom;
    if(!parser){reply({error:{code:'layout',message:'No se pudo iniciar la lectura de la ficha.'}});return;}
    let finished=false,observer,deadline,debounce,settle,latestProduct;const started=Date.now();
    const finish=result=>{if(finished)return;finished=true;observer?.disconnect();clearTimeout(deadline);clearTimeout(debounce);clearTimeout(settle);reply(result);};
    const scan=()=>{
      try{
        const blocked=parser.block(document);if(blocked){finish({error:blocked});return;}
        if(message.kind==='product'){const product=parser.product(document);if(product){latestProduct=product;if(Date.now()-started>=2000&&(product.priceChoices.length||product.loginRequired))finish({product});}}
        else{const candidates=parser.candidates(document);if(candidates.length)finish({candidates});else if(/no (?:se )?encontr(?:aron|amos)|sin resultados/i.test(document.querySelector('main')?.innerText||''))finish({candidates:[]});}
      }catch{finish({error:{code:'layout',message:'La estructura de SYSCOM cambió. Revisa el producto manualmente.'}});}
    };
    observer=new MutationObserver(()=>{clearTimeout(debounce);debounce=setTimeout(scan,200);});observer.observe(document.body||document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','aria-selected','aria-pressed','selected','checked']});
    deadline=setTimeout(()=>{scan();if(!finished)finish(message.kind==='search'?{candidates:[]}:latestProduct?{product:latestProduct}:{error:{code:'layout',message:'No se identificaron los campos de la ficha. Revisa el producto manualmente.'}});},Math.max(1,Math.min(15000,Number(message.timeout)||15000)));
    if(message.kind==='product')settle=setTimeout(scan,2000);
    scan();return true;
  });
})();
