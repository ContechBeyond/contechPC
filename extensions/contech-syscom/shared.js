export const POLICY=Object.freeze({interval:15000,detailPause:4000,hourLimit:60,window:3600000,jobTimeout:65000,pendingTimeout:300000});
export const CHANNEL='contech-syscom-v1';
export const SYS_ORIGINS=['https://www.syscom.mx/*','https://syscom.mx/*'];
export const normalizeModel=value=>String(value??'').normalize('NFKC').trim().toUpperCase().replace(/\s+/g,'');
export function validModel(value){return typeof value==='string'&&value.trim().length>=2&&value.trim().length<=100&&!/[\u0000-\u001f<>]/.test(value);}
export function appOrigin(value){
  let url;try{url=new URL(value);}catch{throw new Error('Abre la app de Contech y copia su dirección.');}
  const local=['127.0.0.1','localhost'].includes(url.hostname)&&url.protocol==='http:';
  const render=url.protocol==='https:'&&url.hostname.endsWith('.onrender.com');
  if((!local&&!render)||url.username||url.password)throw new Error('Usa la dirección HTTPS de Render o la app local de Contech.');
  return url.origin;
}
export function productURL(value){
  let url;try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||!['www.syscom.mx','syscom.mx'].includes(url.hostname)||url.username||url.password||url.port||!/^\/products\/\d+\/?$/.test(url.pathname))return null;
  return url.origin+url.pathname.replace(/\/$/,'');
}
export function rateStatus(history=[],last=0,now=Date.now()){
  const recent=history.filter(value=>Number.isFinite(value)&&value>now-POLICY.window);
  const interval=Math.max(0,last+POLICY.interval-now);
  const hourly=recent.length>=POLICY.hourLimit?Math.max(0,recent[0]+POLICY.window-now):0;
  return {recent,retryAfter:Math.max(interval,hourly),remaining:Math.max(0,POLICY.hourLimit-recent.length)};
}
export class LookupError extends Error{constructor(code,message,retryAfter=0){super(message);this.code=code;this.retryAfter=retryAfter;}}
