import {TOOLS} from './tools.js?portal=7';

export function initPortal({tools=TOOLS,document:doc=globalThis.document,window:win=globalThis.window}={}){
  const $=id=>doc.getElementById(id),homeSlug='herramientas';
  const sidebar=$('tool-sidebar'),menuToggle=$('menu-toggle'),backdrop=$('menu-backdrop'),workspace=$('workspace');
  const mobile=win.matchMedia('(max-width:980px)'),loads=new Map();
  let drawerOpen=false,routeRevision=0;
  const slugs=new Set(),ids=new Set();
  for(const tool of tools){
    if(slugs.has(tool.slug)||ids.has(tool.id)||tool.slug===homeSlug)throw new Error('Cada herramienta necesita un id y una ruta únicos.');
    if(!$(tool.viewId)||!$(tool.headingId))throw new Error(`Falta la vista de la herramienta ${tool.title}.`);
    slugs.add(tool.slug);ids.add(tool.id);
  }
  function element(tag,className,text){const el=doc.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
  function icon(paths){
    const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
    svg.innerHTML=paths;return svg;
  }
  const links=new Map();
  $('tool-menu').replaceChildren();$('tool-cards').replaceChildren();
  for(const tool of tools){
    const link=element('a','tool-nav-link');link.href='#/'+tool.slug;link.append(icon(tool.icon),element('span','',tool.title));
    $('tool-menu').append(link);links.set(tool.id,link);
    const card=element('a','tool-card');card.href=link.href;card.setAttribute('aria-label','Abrir '+tool.title);
    const descriptionId='tool-description-'+tool.id;card.setAttribute('aria-describedby',descriptionId);
    const top=element('div','tool-card-top'),symbol=element('span','tool-card-icon');symbol.append(icon(tool.icon));top.append(symbol);
    if(tool.badge)top.append(element('span','tool-card-badge',tool.badge));
    const description=element('p','tool-card-description',tool.description);description.id=descriptionId;
    const bottom=element('div','tool-card-bottom'),formats=element('div','tool-formats');
    for(const format of tool.formats||[])formats.append(element('span','',format));
    const arrow=element('span','tool-card-arrow');arrow.append(icon('<path d="M5 12h14m-5-5 5 5-5 5"/>'));
    bottom.append(formats,arrow);card.append(top,element('h3','',tool.title),description,bottom);$('tool-cards').append(card);
  }
  $('tool-count').textContent=`${tools.length} ${tools.length===1?'herramienta':'herramientas'}`;

  function setDrawer(open,restoreFocus=false){
    drawerOpen=mobile.matches&&open;
    doc.documentElement.classList.toggle('menu-open',drawerOpen);
    sidebar.classList.toggle('is-open',drawerOpen);sidebar.inert=mobile.matches&&!drawerOpen;
    menuToggle.setAttribute('aria-expanded',String(drawerOpen));
    menuToggle.setAttribute('aria-label',drawerOpen?'Cerrar menú de herramientas':'Abrir menú de herramientas');
    backdrop.hidden=!drawerOpen;workspace.inert=drawerOpen;doc.querySelector('.header').inert=drawerOpen;
    if(mobile.matches){sidebar.setAttribute('aria-hidden',String(!drawerOpen));}else sidebar.removeAttribute('aria-hidden');
    if(drawerOpen){
      sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');
      (sidebar.querySelector('[aria-current="page"]')||$('home-link')).focus({preventScroll:true});
    }else{
      sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');
      if(restoreFocus&&mobile.matches)menuToggle.focus();
    }
  }
  menuToggle.addEventListener('click',()=>setDrawer(!drawerOpen));
  $('menu-close').addEventListener('click',()=>setDrawer(false,true));
  backdrop.addEventListener('click',()=>setDrawer(false,true));
  mobile.addEventListener('change',()=>setDrawer(false,sidebar.contains(doc.activeElement)));
  doc.addEventListener('keydown',event=>{
    if(!drawerOpen)return;
    if(event.key==='Escape'){event.preventDefault();setDrawer(false,true);return;}
    if(event.key!=='Tab')return;
    const focusable=[...sidebar.querySelectorAll('a[href],button:not(:disabled)')].filter(el=>win.getComputedStyle(el).display!=='none');
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&(doc.activeElement===first||!sidebar.contains(doc.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(doc.activeElement===last||!sidebar.contains(doc.activeElement))){event.preventDefault();first.focus();}
  });
  sidebar.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link)return;
    // Selecting the current route must still dismiss the mobile drawer.
    setDrawer(false);if(link.hash===win.location.hash)focusContent();
  });
  doc.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();workspace.focus();});
  function currentTool(){return tools.find(tool=>win.location.hash==='#/'+tool.slug);}
  function focusContent(){const tool=currentTool();$(tool?.headingId||'tools-home-title').focus({preventScroll:true});}
  async function renderRoute(focus=false){
    const revision=++routeRevision,tool=currentTool();
    if(!tool&&win.location.hash!=='#/'+homeSlug)win.history.replaceState(null,'','#/'+homeSlug);
    setDrawer(false);
    $('tools-home').hidden=Boolean(tool);
    for(const candidate of tools){const view=$(candidate.viewId);view.hidden=candidate!==tool;view.inert=false;}
    for(const [id,link] of links){if(id===tool?.id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
    if(tool)$('home-link').removeAttribute('aria-current');else $('home-link').setAttribute('aria-current','page');
    $('tool-breadcrumb').hidden=!tool;$('current-tool-name').textContent=tool?.title||'';
    doc.title=(tool?.title||'Herramientas')+' · Contech';
    $('tool-load-notice').hidden=true;$('tool-load-retry').hidden=true;
    if(focus){win.scrollTo(0,0);focusContent();}
    if(!tool)return;
    const view=$(tool.viewId);view.inert=true;
    $('tool-load-message').textContent='Abriendo '+tool.title+'…';$('tool-load-notice').classList.remove('error');$('tool-load-notice').hidden=false;
    try{
      if(!loads.has(tool.id))loads.set(tool.id,Promise.resolve().then(()=>tool.load?.()));
      await loads.get(tool.id);
      if(revision!==routeRevision)return;
      view.inert=false;$('tool-load-notice').hidden=true;if(focus)focusContent();
    }catch(error){
      loads.delete(tool.id);if(revision!==routeRevision)return;
      $('tool-load-message').textContent='No se pudo abrir esta herramienta. Revisa tu conexión e inténtalo otra vez.';
      $('tool-load-notice').classList.add('error');$('tool-load-retry').hidden=false;
      console.error(error);
    }
  }
  win.addEventListener('hashchange',()=>renderRoute(true));
  $('tool-load-retry').addEventListener('click',()=>renderRoute(true));
  setDrawer(false);
  return renderRoute();
}

if(globalThis.document?.getElementById('tool-menu'))initPortal();
