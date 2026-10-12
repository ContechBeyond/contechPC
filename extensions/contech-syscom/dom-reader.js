// Only rendered product content is read. No cookies, application state or private endpoints.
(()=>{
  if(globalThis.ContechSyscomDom)return;
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const model=value=>clean(value).normalize('NFKC').toUpperCase().replace(/\s+/g,'');
  function visible(node){
    if(!node||node.closest('[hidden],script,style,template'))return false;
    const win=node.ownerDocument.defaultView;
    for(let n=node;n&&n.nodeType===1;n=n.parentElement){const style=win?.getComputedStyle(n);if(style?.display==='none'||style?.visibility==='hidden'||style?.visibility==='collapse')return false;}
    return true;
  }
  const rendered=node=>node?.innerText??node?.textContent??'';
  function text(node){return clean(rendered(node));}
  function block(doc){
    const body=clean(rendered(doc.body)).slice(0,7000),title=clean(doc.title);
    if(/just a moment|attention required|access denied|forbidden|you have been blocked|request blocked|error\s+(?:403|429)|too many requests|verifica(?:r)? que (?:eres|es) humano|verify (?:that )?you are human|acceso denegado|demasiadas solicitudes|checking your browser/i.test(title+' '+body))return {code:'blocked',message:'SYSCOM muestra una verificación o un bloqueo. Las consultas quedaron pausadas. Revisa la pestaña manualmente.'};
    const widgets=doc.querySelectorAll('iframe[src*="recaptcha"],iframe[src*="challenges.cloudflare"],.cf-turnstile,.g-recaptcha');
    if([...widgets].some(node=>visible(node)))return {code:'blocked',message:'SYSCOM muestra un CAPTCHA. Las consultas quedaron pausadas; resuélvelo manualmente si corresponde.'};
    if(/^\/login(?:\/|$)/.test(doc.location?.pathname||''))return {code:'login',message:'Inicia sesión manualmente en SYSCOM y vuelve a consultar el modelo.'};
    return null;
  }
  function safeURL(value,base){
    try{const url=new URL(value,base);return url.protocol==='https:'&&['www.syscom.mx','syscom.mx'].includes(url.hostname)&&/^\/products\/\d+\/?$/.test(url.pathname)?url.origin+url.pathname.replace(/\/$/,''):null;}catch{return null;}
  }
  function candidates(doc){
    const main=doc.querySelector('main')||doc.body,groups=new Map();
    for(const a of [...main.querySelectorAll('a[href]')].slice(0,1500)){
      if(!visible(a))continue;const url=safeURL(a.getAttribute('href'),doc.location?.href||'https://www.syscom.mx/'),value=text(a);
      if(!url||!value)continue;if(!groups.has(url))groups.set(url,[]);groups.get(url).push({a,value});
    }
    const found=[];
    for(const [url,links] of groups){
      const models=links.filter(({a,value})=>!a.querySelector('h1,h2,h3')&&value.length<=100&&/^[\p{L}\d][\p{L}\d_()./+\-]*$/u.test(value));
      if(!models.length)continue;const source=models[0],title=links.map(link=>link.value).filter(value=>value!==source.value).sort((a,b)=>b.length-a.length)[0]||source.value;
      let brand='';
      for(let n=source.a.parentElement,depth=0;n&&depth<8;depth++,n=n.parentElement){
        const urls=new Set([...n.querySelectorAll('a[href]')].map(a=>safeURL(a.getAttribute('href'),url)).filter(Boolean));if(urls.size>1)break;
        const brandLink=[...n.querySelectorAll('a[href]')].find(a=>visible(a)&&/^\/products(?:\?|$)/.test(a.getAttribute('href')||'')&&text(a));
        if(brandLink){brand=text(brandLink).slice(0,100);break;}
      }
      found.push({model:source.value,title:title.slice(0,1200),brand,url});
    }
    return found.slice(0,30);
  }
  function labelled(scope,label){
    for(const node of scope.querySelectorAll('span,dt,label,strong')){
      if(!visible(node)||text(node).replace(/:$/,'').toLowerCase()!==label.toLowerCase())continue;
      for(let sibling=node.nextElementSibling;sibling;sibling=sibling.nextElementSibling)if(!['BUTTON','SVG'].includes(sibling.tagName)&&visible(sibling)&&text(sibling))return text(sibling);
      const next=node.parentElement?.nextElementSibling;if(node.tagName==='DT'&&next?.tagName==='DD')return text(next);
    }
    return '';
  }
  function decimal(value){
    let raw=String(value).replace(/[^\d.,]/g,'');if(!raw||raw.length>20)return null;
    if(raw.includes('.')&&raw.includes(',')){const separator=raw.lastIndexOf('.')>raw.lastIndexOf(',')?'.':',';raw=raw.replace(separator==='.'?/,/g:/\./g,'').replace(',','.');}
    else if(raw.includes(',')){if(/,\d{1,2}$/.test(raw))raw=raw.replace(',','.');else if(/^\d{1,3}(,\d{3})+$/.test(raw))raw=raw.replace(/,/g,'');else return null;}
    else if((raw.match(/\./g)||[]).length>1){if(/^\d{1,3}(\.\d{3})+$/.test(raw))raw=raw.replace(/\./g,'');else return null;}
    const n=Number(raw);return Number.isFinite(n)&&n>=0&&n<=1000000000?n:null;
  }
  function selectedCurrency(scope){
    const found=new Set(),currency=value=>{const usd=/\bUSD\b|d[oó]lares/i.test(value),mxn=/\bMXN\b|pesos/i.test(value);return usd&&!mxn?'USD':mxn&&!usd?'MXN':null;};
    for(const node of scope.querySelectorAll('select,button[aria-pressed="true"],[role="tab"][aria-selected="true"],input[type="radio"]:checked')){
      if(!visible(node))continue;
      const value=node.tagName==='SELECT'?text(node.selectedOptions?.[0]):node.tagName==='INPUT'?[...node.labels||[]].filter(visible).map(text).join(' '):text(node);
      const chosen=currency(value);if(chosen)found.add(chosen);
    }
    return found.size===1?[...found][0]:null;
  }
  function prices(scope,doc){
    const found=new Map(),selected=selectedCurrency(scope),body=clean(rendered(doc.body)),vat=/precios?\s+sin\s+iva|no\s+incluye(?:n)?\s+iva/i.test(body)?false:/precios?\s+con\s+iva|iva\s+incluido/i.test(body)?true:null;
    for(const node of [...scope.querySelectorAll('span,p,div,strong,b')].slice(0,700)){
      if(!visible(node)||node.closest('s,del'))continue;const value=text(node);if(value.length>110||!/[\d][\d.,]*|\$/.test(value)||!(/\$|USD|MXN/i.test(value)))continue;
      let struck=false;for(let ancestor=node,depth=0;ancestor&&depth<6&&scope.contains(ancestor);depth++,ancestor=ancestor.parentElement)if(doc.defaultView?.getComputedStyle(ancestor)?.textDecorationLine?.includes('line-through')){struck=true;break;}if(struck)continue;
      const amounts=[...value.matchAll(/(?:US\$|USD\s*\$?|MXN\s*\$?|\$)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(USD|MXN)/gi)];if(amounts.length!==1)continue;
      const amount=decimal(amounts[0][1]||amounts[0][2]);if(amount===null)continue;
      const context=text(node.parentElement);if(/precio\s+(?:de\s+)?lista|mensual|meses|ahorro|flete|env[ií]o|mayoreo|a partir de|por\s+\d+/i.test(value))continue;
      const contextAmounts=[...context.matchAll(/(?:US\$|USD\s*\$?|MXN\s*\$?|\$)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(USD|MXN)/gi)].length;
      const local=context.length<180&&contextAmounts<=1?context:value;if(/precio\s+(?:de\s+)?lista|mensual|meses|ahorro|descuento\s+de|flete|env[ií]o|mayoreo|a partir de|por\s+\d+/i.test(local))continue;const usd=/\bUSD\b|US\$|d[oó]lares/i.test(local),mxn=/\bMXN\b|pesos/i.test(local);
      const currency=usd&&!mxn?'USD':mxn&&!usd?'MXN':selected;
      // A bare dollar sign needs an explicit selection in the visible currency control.
      if(!currency)continue;const withIVA=/sin\s+iva|no\s+incluye\s+iva/i.test(local)?false:/con\s+iva|iva\s+incluido/i.test(local)?true:vat;
      const key=amount+':'+currency+':'+withIVA;
      if(!found.has(key))found.set(key,{unitCost:amount,currency,withIVA,label:local.slice(0,180)});
    }
    return [...found.values()].slice(0,8);
  }
  function product(doc){
    const heading=[...doc.querySelectorAll('h1')].find(visible);if(!heading)return null;
    let scope=heading.parentElement,identified=false;
    for(let depth=0;scope&&depth<6;depth++,scope=scope.parentElement)if(labelled(scope,'Modelo')&&labelled(scope,'Marca')){identified=true;break;}
    if(!scope||!identified)return null;const sku=labelled(scope,'Modelo'),brand=labelled(scope,'Marca');if(!sku||!brand)return null;
    // The nearest grid holds the product's price, before related-product sections.
    let area=scope;
    for(let n=scope,depth=0;n&&depth<4;depth++,n=n.parentElement){if(n.querySelector('h2,h3'))break;area=n;if(n.classList.contains('grid'))break;}
    const title=text(heading),priceChoices=prices(area,doc);
    const loginRequired=/inicia\s+sesi[oó]n\s+para\s+ver\s+precios|acceder\s+a\s+mi\s+cuenta/i.test(text(area));
    return {model:sku.slice(0,100),brand:brand.slice(0,100),supplier:'SYSCOM',concept:title.split(/\s*\/\s*/)[0].slice(0,180),description:title.slice(0,1200),url:doc.location?.href||'',priceChoices,price:priceChoices.length===1&&priceChoices[0].withIVA===false?priceChoices[0]:null,loginRequired};
  }
  globalThis.ContechSyscomDom={clean,normalizeModel:model,visible,block,candidates,product,prices,decimal,selectedCurrency};
})();
