(function(){
  const key='contech-theme',root=document.documentElement;
  const media=window.matchMedia?.('(prefers-color-scheme: dark)');
  const valid=value=>value==='dark'||value==='light'?value:null;
  let preference=null;
  try{preference=valid(window.localStorage.getItem(key));}catch{}
  const systemTheme=()=>media?.matches?'dark':'light';
  const icons={
    dark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z"/></svg>',
    light:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
  };
  function apply(theme){
    root.dataset.theme=theme;root.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#10141b':'#bf1b23');
    const button=document.getElementById('theme-toggle');if(!button)return;
    const next=theme==='dark'?'light':'dark',label=next==='dark'?'Modo oscuro':'Modo claro';
    button.setAttribute('aria-label','Cambiar a '+label.toLowerCase());button.title='Cambiar a '+label.toLowerCase();
    document.getElementById('theme-label').textContent=label;document.getElementById('theme-icon').innerHTML=icons[next];
  }
  apply(preference||systemTheme());
  function initialize(){
    const button=document.getElementById('theme-toggle');if(!button)return;
    apply(preference||systemTheme());
    button.addEventListener('click',()=>{
      preference=root.dataset.theme==='dark'?'light':'dark';
      try{window.localStorage.setItem(key,preference);}catch{}
      apply(preference);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
  const followSystem=()=>{if(!preference)apply(systemTheme());};
  if(media?.addEventListener)media.addEventListener('change',followSystem);else media?.addListener?.(followSystem);
  window.addEventListener('storage',event=>{if(event.key!==key&&event.key!==null)return;preference=valid(event.newValue);apply(preference||systemTheme());});
})();
