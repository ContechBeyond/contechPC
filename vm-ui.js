import {VM_MAX_ITEMS,validateMatrix,calculateMatrix,vmNumber,matrixBookName,vmSectionItems} from './vm-core.js';
import {buildMatrixWorkbook} from './vm-xlsx.js';
import {createBlankMatrixState,readMatrixDraft,writeMatrixDraft,removeMatrixDraft} from './vm-draft.js';
import {money} from './core.js';
import {downloadBlob} from './exporters.js';
import {createSyscomClient} from './syscom-client.js?syscom=1';
let initialized=false;
export function initMatrixBuilder(){
  if(initialized)return;initialized=true;
  const $=id=>document.getElementById(id),root=$('vm-form');
  const state=createBlankMatrixState();
  let storage;try{storage=window.localStorage;}catch{/* Editing still works when browser storage is blocked. */}
  const recovered=readMatrixDraft(storage);if(recovered.status==='restored')Object.assign(state,recovered.draft.state);
  let savingReady=false,lastDraftSnapshot,activeTab=recovered.status==='restored'?recovered.draft.ui.activeTab:'data';
  let nextId=0,busy=false,lookupCurrent=null,connector=null,cooldownUntil=0,cooldownTimer,noticeTimer,noticeItem;
  const rowNodes=new Map(),names={equipment:'Equipo',labor:'Servicio',volume:'Material',miscellaneous:'Consumible'};
  const tabNames={data:'Datos',equipment:'Equipos y materiales',labor:'Mano de obra',volume:'Volumetría',miscellaneous:'Misceláneos'},tabs=Object.keys(tabNames);
  const settingsFields={exchangeRate:'vm-exchange-rate',indirectPct:'vm-indirect-pct',feePct:'vm-fee-pct',commissionPct:'vm-commission-pct',provisionPct:'vm-provision-pct',rounding:'vm-rounding'};
  const rows=section=>section==='equipment'?state.equipment:state[section].items;
  const format=value=>Number.isFinite(value)?money(Math.round(value*100)):'—';
  function draftStatus(message,warning=false){
    const node=$('vm-draft-status');if(node.textContent!==message)node.textContent=message;node.classList.toggle('warning',warning);
  }
  function draftUi(){
    return {activeTab,equipment:Object.fromEntries(state.equipment.map(item=>{const node=rowNodes.get(item.id);return [item.id,{open:node.details.open,pricePending:node.pricePending}];}))};
  }
  function draftSnapshot(){return JSON.stringify({state,ui:draftUi()});}
  function saveDraft(){
    if(!savingReady)return;
    const snapshot=draftSnapshot();if(snapshot===lastDraftSnapshot)return;
    const result=writeMatrixDraft(storage,state,draftUi());
    if(result.ok){lastDraftSnapshot=snapshot;draftStatus('Borrador guardado en este navegador.');}
    else draftStatus('No se pudo guardar en este navegador. Los datos siguen disponibles en esta página.',true);
  }
  function syncMainFields(){
    for(const key of ['client','project'])$('vm-'+key).value=state[key];
    for(const [key,id] of Object.entries(settingsFields))$(id).value=String(state.settings[key]);
  }
  function selectTab(section,{focus=false,save=true}={}){
    if(!tabs.includes(section))section='data';activeTab=section;
    for(const name of tabs){const selected=name===section,button=$('vm-tab-'+name);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;button.classList.toggle('active',selected);$('vm-'+name+'-section').hidden=!selected;}
    const button=$('vm-tab-'+section);if(focus)button.focus();button.scrollIntoView?.({block:'nearest',inline:'nearest'});
    if(save)saveDraft();
  }
  function issueControl(issue){
    const parts=issue?.path?.split('.')||[],section=parts[0];
    if(['client','project'].includes(section))return {tab:'data',control:$('vm-'+section)};
    if(section==='settings')return {tab:'data',control:$(settingsFields[parts[1]])};
    if(section in names){const item=rows(section)[Number(parts[1])];return {tab:section,control:item?rowNodes.get(item.id)?.block.querySelector('[data-key="'+parts[2]+'"]'):null,item};}
    return {tab:'data'};
  }
  function reviewIssue(issue){
    const {tab,control,item}=issueControl(issue);selectTab(tab);
    if(tab==='equipment'&&item)rowNodes.get(item.id).details.open=true;
    if(control){const details=control.closest('details');if(details)details.open=true;control.focus();}
    else $('vm-tab-'+tab).focus();
  }
  function closeConnectionMenu(restoreFocus=false){
    const menu=$('vm-syscom-menu'),button=$('vm-syscom-toggle');if(menu.hidden)return;
    menu.hidden=true;button.setAttribute('aria-expanded','false');if(restoreFocus)button.focus();
  }
  function clearDraft(){
    if(busy||lookupCurrent)return;
    const result=removeMatrixDraft(storage);
    if(!result.ok){$('vm-clear-dialog').close();draftStatus('No se pudo eliminar el borrador guardado. Tus datos se conservan.',true);return;}
    savingReady=false;clearTimeout(noticeTimer);noticeItem=null;$('vm-add-notice').hidden=true;
    for(const node of rowNodes.values())clearTimeout(node.attentionTimer);
    rowNodes.clear();for(const section of Object.keys(names))$('vm-'+section+'-list').replaceChildren();
    Object.assign(state,createBlankMatrixState());nextId=0;syncMainFields();addRow('equipment');for(const section of ['labor','volume','miscellaneous'])relabel(section);selectTab('data',{save:false});invalidate();update();
    // Establish a new baseline before queued <details> toggle events run.
    // A cleared or untouched form must not recreate a blank saved draft.
    lastDraftSnapshot=draftSnapshot();savingReady=true;
    draftStatus('Matriz limpia. Los cambios nuevos se guardarán automáticamente.');
    $('vm-clear-dialog').close();$('vm-client').focus();
  }
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function invalidate(){ $('vm-error').hidden=true;$('vm-success').hidden=true;$('vm-folio-help').textContent='El folio se genera al crear el archivo, con hora, minutos, día, mes y año de Ciudad de México.';}
  function clearAddAttention(item){
    const node=rowNodes.get(item.id);if(node){clearTimeout(node.attentionTimer);node.block.classList.remove('vm-item-attention');}
    if(noticeItem===item.id){clearTimeout(noticeTimer);$('vm-add-notice').hidden=true;noticeItem=null;}
  }
  function manualPrice(item){
    const node=rowNodes.get(item.id);if(!node)return;
    node.pricePending=false;node.lookupChoices.hidden=true;node.lookupMessage.textContent='Captura manual: puedes indicar el precio o dejarlo vacío.';clearAddAttention(item);
  }
  function pendingPriceNotice(item,loading=false){
    const node=rowNodes.get(item.id);if(!node)return;selectTab('equipment');node.details.open=true;
    const concept=item.concept.trim()||'este equipo',notice=$('vm-add-notice');clearTimeout(noticeTimer);noticeItem=item.id;
    notice.textContent=loading?`Espera a que termine la consulta de ${concept} antes de agregar otro equipo.`:`Selecciona el precio de ${concept} o elige «Capturar precio manualmente» antes de agregar otro equipo.`;notice.hidden=false;
    noticeTimer=setTimeout(()=>{notice.hidden=true;noticeItem=null;},5000);
    clearTimeout(node.attentionTimer);node.block.classList.remove('vm-item-attention');void node.block.offsetWidth;node.block.classList.add('vm-item-attention');
    node.attentionTimer=setTimeout(()=>node.block.classList.remove('vm-item-attention'),2800);
    node.block.scrollIntoView?.({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
    const target=loading?node.lookupCancel:node.lookupChoices.querySelector('button:not(:disabled)')||node.manualPrice;
    (target&&!target.hidden&&!target.disabled?target:node.block.querySelector('summary')).focus({preventScroll:true});
  }
  function field(section,item,key,label,{wide=false,metadata=false,required=false,max=100,numeric=false,textarea=false,options}={}){
    const wrapper=element('label','field'+(wide?' vm-field-wide':'')+(metadata?' vm-field-metadata':'')),caption=element('span','',label);
    if(required){const mark=element('span','required',' *');caption.append(mark);}wrapper.append(caption);
    const control=element(options?'select':textarea?'textarea':'input');control.id=`vm-${item.id}-${key}`;control.dataset.key=key;control.required=required;
    if(textarea){control.rows=3;control.maxLength=max;}else if(!options){control.type='text';control.maxLength=max;control.autocomplete='off';if(numeric)control.inputMode='decimal';}
    if(options)for(const [value,title] of options){const option=element('option','',title);option.value=value;control.append(option);}
    control.value=item[key]??'';
    control.addEventListener(options?'change':'input',()=>{item[key]=control.value;invalidate();if(section==='equipment'){if(key==='unitCost')manualPrice(item);refreshVolumeChoices();}update();});wrapper.append(control);return wrapper;
  }
  function renderRow(section,item,index){
    const equipment=section==='equipment',block=element('fieldset','vm-item'+(equipment?' vm-equipment-item':'')),legend=element('legend',equipment?'sr-only':'',names[section]+' '+(index+1));block.dataset.item=item.id;block.append(legend);
    let details,title,content=block;
    if(equipment){details=element('details','vm-equipment-details');details.open=true;content=element('div','vm-equipment-body');block.append(details);}
    const bar=element('div','vm-item-toolbar'),total=element('output','vm-item-total','Costo directo: —'),remove=element('button','icon-button');remove.type='button';remove.setAttribute('aria-label',`Eliminar ${names[section].toLowerCase()} ${index+1}`);remove.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg>';
    remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();clearAddAttention(item);rows(section).splice(rows(section).indexOf(item),1);rowNodes.delete(item.id);block.remove();relabel(section);refreshVolumeChoices();invalidate();update();const next=$('vm-'+section+'-list').querySelector('summary,input,textarea,select');(next||$('vm-add-'+section)).focus();});
    if(equipment){const summary=element('summary','vm-equipment-summary'),heading=element('span','vm-equipment-heading'),chevron=element('span','vm-equipment-chevron');title=element('span','vm-equipment-title');heading.append(title,total);chevron.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';summary.append(heading,remove,chevron);details.append(summary,content);}
    else{bar.append(total,remove);block.append(bar);}
    let lookupButton,lookupCancel,lookupMessage,lookupChoices,manualPriceButton;
    if(section==='equipment'){
      const lookup=element('div','vm-model-lookup');lookup.append(field(section,item,'model','Modelo',{metadata:true}));
      lookupButton=element('button','button button-secondary vm-lookup-button','Buscar en SYSCOM');lookupButton.type='button';lookupButton.addEventListener('click',()=>queryProduct(item));lookup.append(lookupButton);content.append(lookup);
      lookup.querySelector('input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(!lookupButton.disabled)queryProduct(item);}});
      lookupMessage=element('p','vm-lookup-message');lookupMessage.setAttribute('role','status');lookupMessage.textContent='Busca por modelo para completar los datos del equipo.';
      lookupCancel=element('button','text-button','Cancelar consulta');lookupCancel.type='button';lookupCancel.hidden=true;lookupCancel.addEventListener('click',()=>client.request('cancel').catch(error=>{lookupMessage.textContent=error.message;}));
      lookupChoices=element('div','vm-lookup-choices');lookupChoices.hidden=true;content.append(lookupMessage,lookupCancel,lookupChoices);
      manualPriceButton=element('button','text-button vm-manual-price','Capturar precio manualmente');manualPriceButton.type='button';manualPriceButton.hidden=true;
      manualPriceButton.addEventListener('click',()=>{manualPrice(item);invalidate();update();rowNodes.get(item.id).cost.focus();});content.append(manualPriceButton);
    }
    const grid=element('div','vm-item-grid'+(section==='equipment'?' vm-equipment-grid':''));
    grid.append(field(section,item,'concept','Concepto',{wide:true,required:true,max:180}),field(section,item,'description','Descripción',{wide:true,textarea:true,max:section==='miscellaneous'?600:1200}));
    if(section==='equipment')for(const [key,label] of [['brand','Marca'],['supplier','Proveedor']])grid.append(field(section,item,key,label,{metadata:true}));
    grid.append(field(section,item,'quantity','Cantidad',{numeric:true,max:30}));
    if(section==='volume')grid.append(field(section,item,'unit','Unidad',{max:20}));
    grid.append(field(section,item,'unitCost',section==='equipment'?'Precio de compra unitario':'Precio unitario MXN',{numeric:true,max:30}));
    if(section==='equipment')grid.append(field(section,item,'currency','Moneda',{options:[['USD','USD'],['MXN','MXN']]}));
    let source,units;
    if(section==='volume'){
      const sourceField=field(section,item,'sourceEquipment','Precio del material',{wide:true,required:false,options:[['','Capturar precio manual']]}),unitsField=field(section,item,'unitsPerPack','Unidades por presentación del equipo',{wide:true,numeric:true,max:30});
      source=sourceField.querySelector('select');units=unitsField;unitsField.append(element('small','','Ej. 152 metros por bobina. El precio se toma del equipo y se divide entre estas unidades.'));grid.append(sourceField,unitsField);
    }
    content.append(grid);$('vm-'+section+'-list').append(block);rowNodes.set(item.id,{block,legend,details,title,remove,total,source,units,cost:grid.querySelector('[data-key="unitCost"]'),lookupButton,lookupCancel,lookupMessage,lookupChoices,manualPrice:manualPriceButton,pricePending:false});
    if(equipment)details.addEventListener('toggle',saveDraft);
    refreshVolumeChoices();return block;
  }
  function relabel(section){const items=rows(section);items.forEach((item,i)=>{const node=rowNodes.get(item.id);if(section!=='equipment'){node.legend.textContent=names[section]+' '+(i+1);node.remove.setAttribute('aria-label',`Eliminar ${names[section].toLowerCase()} ${i+1}`);}});
    const list=$('vm-'+section+'-list');list.querySelector('.vm-empty-list')?.remove();if(!items.length)list.append(element('p','vm-empty-list','Agrega una partida para incluirla en la matriz.'));
  }
  function addRow(section,focus=false){
    if(busy||rows(section).length>=VM_MAX_ITEMS)return;
    if(section==='equipment'){
      const pending=lookupCurrent?.item||state.equipment.find(item=>rowNodes.get(item.id).pricePending);
      if(pending){pendingPriceNotice(pending,Boolean(lookupCurrent));return;}
      const previous=state.equipment.at(-1);if(previous)rowNodes.get(previous.id).details.open=false;
    }
    const item={id:section+'-'+(++nextId),concept:'',description:'',quantity:section==='equipment'?'1':'',unitCost:'',model:'',brand:'',supplier:'',currency:'USD',unit:'m',sourceEquipment:'',unitsPerPack:''};rows(section).push(item);$('vm-'+section+'-list').querySelector('.vm-empty-list')?.remove();const node=renderRow(section,item,rows(section).length-1);invalidate();update();if(focus){selectTab(section);node.querySelector('input').focus();}
  }
  function refreshVolumeChoices(){
    for(const item of state.volume.items){const node=rowNodes.get(item.id);if(!node?.source)continue;const options=[['','Capturar precio manual'],...state.equipment.map((equipment,i)=>[equipment.id,`${i+1}. ${equipment.concept.trim()||'Equipo sin nombre'}`])];if(item.sourceEquipment&&!options.some(([id])=>id===item.sourceEquipment))options.push([item.sourceEquipment,'Equipo eliminado: elige otra opción']);node.source.replaceChildren(...options.map(([value,title])=>{const option=element('option','',title);option.value=value;return option;}));node.source.value=item.sourceEquipment;
    }
  }
  function rowCost(section,item){
    let cost=vmNumber(item.unitCost);
    if(section==='equipment'&&item.currency==='USD')cost*=vmNumber(state.settings.exchangeRate);
    if(section==='volume'&&item.sourceEquipment){const equipment=state.equipment.find(row=>row.id===item.sourceEquipment);const units=vmNumber(item.unitsPerPack);cost=equipment&&units>0?vmNumber(equipment.unitCost)*(equipment.currency==='USD'?vmNumber(state.settings.exchangeRate):1)/units:NaN;}
    return {unit:cost,total:vmNumber(item.quantity)>0&&cost>=0?vmNumber(item.quantity)*cost:NaN};
  }
  function update(){
    const included=Object.fromEntries(Object.keys(names).map(section=>[section,vmSectionItems(section,rows(section))]));
    for(const section of ['labor','volume','miscellaneous'])state[section].enabled=Boolean(included[section].length);
    for(const section of Object.keys(names))$('vm-tab-'+section+'-count').textContent=String(included[section].length);
    for(const section of tabs)$('vm-tab-'+section).disabled=busy;
    for(const id of ['vm-collapse-equipment','vm-expand-equipment'])$(id).disabled=busy||!state.equipment.length;
    for(const [section,name] of Object.entries(names)){
      $('vm-add-'+section).disabled=busy||rows(section).length>=VM_MAX_ITEMS;
      for(const item of rows(section)){
        const node=rowNodes.get(item.id),cost=rowCost(section,item);node.total.textContent='Costo directo: '+format(cost.total);
        if(section==='equipment'){
          const concept=item.concept.trim()||'Equipo sin concepto';node.title.textContent=concept;node.legend.textContent=concept;node.remove.setAttribute('aria-label',`Eliminar ${concept}`);
          node.lookupButton.disabled=busy||Boolean(lookupCurrent)||!connector||Boolean(connector.paused)||Date.now()<cooldownUntil||item.model.trim().length<2;
          node.lookupButton.textContent=lookupCurrent?.item===item?'Consultando…':'Buscar en SYSCOM';node.lookupCancel.hidden=lookupCurrent?.item!==item;
          for(const control of node.block.querySelectorAll('input,textarea,select,button'))if(control!==node.lookupButton&&control!==node.lookupCancel)control.disabled=busy||lookupCurrent?.item===item||control.dataset.includesVat==='true';
          node.lookupCancel.disabled=busy;
          node.manualPrice.hidden=!node.pricePending;
        }
        if(section==='volume'){const linked=Boolean(item.sourceEquipment);node.units.hidden=!linked;node.cost.readOnly=linked;node.cost.value=linked&&Number.isFinite(cost.unit)?String(cost.unit):linked?'':item.unitCost;}
      }
    }
    const result=validateMatrix(state);let calculation;
    if(result.valid)try{calculation=calculateMatrix(state);}catch(error){result.valid=false;result.issues.push({message:error.message});}
    const count=included.equipment.length+included.labor.length+(included.miscellaneous.length?1:0);
    $('vm-item-count').textContent=String(count);
    if($('vm-success').hidden)$('vm-filename').textContent=matrixBookName(state.client.trim()||'Cliente',state.project.trim()||'Proyecto','000000000000').replace(/000000000000$/,'[folio automático]')+'.xlsx';
    for(const [id,value] of [['vm-direct-total',calculation?.totals.direct],['vm-labor-total',calculation?.laborDirect],['vm-misc-total',calculation?.miscDirect],['vm-sale-total',calculation?.totals.total]])$(id).textContent=format(value);
    $('vm-download').disabled=busy||Boolean(lookupCurrent)||!result.valid;$('vm-download').textContent=busy?'Preparando Excel…':'Crear y descargar Excel VM';
    const status=$('vm-ready-status');status.classList.toggle('ready',result.valid);status.textContent=busy?'Preparando las hojas y sus fórmulas…':result.valid?'Lista para generar el Excel con fórmulas y referencias.':result.issues.slice(0,2).map(issue=>issue.message).join(' ');
    const review=$('vm-review-issues');review.hidden=busy||result.valid||!result.issues.length;review.textContent='Revisar '+tabNames[issueControl(result.issues[0]).tab];review.disabled=busy;
    $('vm-clear-draft').disabled=busy||Boolean(lookupCurrent);saveDraft();
  }
  function connectionStatus(){
    const node=$('vm-syscom-status'),seconds=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));
    node.classList.toggle('ready',Boolean(connector&&!connector.paused));
    const remaining=seconds>=60?Math.ceil(seconds/60)+' min':seconds+' s';
    node.textContent=!connector?'Instala la extensión de Chrome y conecta esta app desde su icono.':connector.paused?'Consultas pausadas. Revisa SYSCOM y reanuda desde la extensión.':seconds?`Extensión conectada. Próxima búsqueda en ${remaining}.`:'Extensión conectada. Consulta un modelo a la vez.';
    const status=!connector?'disconnected':connector.paused?'warning':'ready',label=!connector?'SYSCOM: extensión desconectada':connector.paused?'SYSCOM: consultas pausadas':'SYSCOM: extensión conectada';
    $('vm-extension-control').dataset.state=status;$('vm-syscom-dot').dataset.state=status;$('vm-syscom-toggle').setAttribute('aria-label',label);$('vm-syscom-toggle').title=label;
  }
  function cooldown(milliseconds){
    cooldownUntil=Math.max(cooldownUntil,Date.now()+milliseconds);clearInterval(cooldownTimer);connectionStatus();
    if(milliseconds>0)cooldownTimer=setInterval(()=>{connectionStatus();update();if(Date.now()>=cooldownUntil){clearInterval(cooldownTimer);cooldownTimer=null;}},1000);
  }
  async function refreshConnection(){
    try{connector=await client.ping();if(connector.retryAfter)cooldown(connector.retryAfter);}catch{connector=null;}
    connectionStatus();update();
  }
  function applyProduct(item,product){
    const node=rowNodes.get(item.id);if(!node)return;
    clearAddAttention(item);node.pricePending=!product.price;
    for(const key of ['model','concept','description','brand','supplier']){item[key]=String(product[key]??'');node.block.querySelector('[data-key="'+key+'"]').value=item[key];}
    item.unitCost=product.price?String(product.price.unitCost):'';node.cost.value=item.unitCost;
    if(product.price){item.currency=product.price.currency;node.block.querySelector('[data-key="currency"]').value=item.currency;}
    node.lookupMessage.replaceChildren();const sourceLink=element('a','','Ver ficha en SYSCOM');sourceLink.href=product.url;sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';
    node.lookupMessage.append(document.createTextNode(product.price?'Datos y precio sin IVA cargados. Revisa el precio y la cantidad. ':product.loginRequired?'Datos cargados. Inicia sesión en SYSCOM para consultar el precio. ':'Datos cargados. Revisa el precio y la moneda en la ficha y captúralos. '),sourceLink);
    node.lookupChoices.replaceChildren();node.lookupChoices.hidden=true;
    if(!product.price&&product.priceChoices?.length){
      node.lookupChoices.hidden=false;node.lookupChoices.append(element('p','help','La ficha muestra varias opciones o no indica claramente el IVA. Elige el precio de compra sin IVA que corresponda a tu cuenta.'));
      for(const price of product.priceChoices){
        const button=element('button','button button-secondary vm-product-choice',`${money(Math.round(price.unitCost*100))} ${price.currency} · ${price.withIVA===true?'Con IVA':price.withIVA===false?'Sin IVA':'IVA sin identificar'}`);button.type='button';button.disabled=price.withIVA===true;button.dataset.includesVat=String(price.withIVA===true);button.title=price.label||'';
        button.addEventListener('click',()=>{item.unitCost=String(price.unitCost);item.currency=price.currency;node.cost.value=item.unitCost;node.block.querySelector('[data-key="currency"]').value=item.currency;node.lookupMessage.textContent='Precio seleccionado por ti. Verifica que sea tu costo unitario sin IVA.';node.lookupChoices.hidden=true;node.pricePending=false;clearAddAttention(item);invalidate();refreshVolumeChoices();update();});node.lookupChoices.append(button);
      }
    }
    invalidate();refreshVolumeChoices();update();
  }
  async function queryProduct(item,selection=null){
    if(busy||lookupCurrent)return;const node=rowNodes.get(item.id);if(!node)return;
    const initialModel=item.model.trim();if(initialModel.length<2){node.lookupMessage.textContent='Escribe el modelo antes de buscar.';return;}
    lookupCurrent={item};node.lookupMessage.textContent=selection?'Abriendo la ficha del modelo elegido…':'Buscando el modelo en SYSCOM…';node.lookupChoices.hidden=true;update();
    try{
      const result=await client.request(selection?'select':'search',selection||{model:initialModel});
      if(!rowNodes.has(item.id)||item.model.trim()!==initialModel)return;
      if(result.kind==='product')applyProduct(item,result.product);
      else{
        node.pricePending=true;
        node.lookupMessage.textContent=result.exact?'Hay varias fichas con el mismo modelo. Elige la que corresponde.':'No hubo una coincidencia exacta. Elige un modelo de los resultados o revisa tu búsqueda.';
        node.lookupChoices.replaceChildren();node.lookupChoices.hidden=false;
        result.candidates.forEach((candidate,index)=>{const button=element('button','button button-secondary vm-product-choice');button.type='button';button.append(element('strong','',candidate.model),element('small','',candidate.title));button.addEventListener('click',()=>queryProduct(item,{token:result.token,index}));node.lookupChoices.append(button);});
      }
    }catch(error){node.lookupMessage.textContent=error.message;if(error.retryAfter)cooldown(error.retryAfter);}
    finally{lookupCurrent=null;await refreshConnection();update();}
  }
  const client=createSyscomClient({onReady:refreshConnection});
  // A slow lazy load may finish after the user has left the matrix tool.
  $('vm-extension-control').hidden=Boolean(window.location.hash&&window.location.hash!=='#/crear-matriz');
  $('vm-syscom-toggle').addEventListener('click',()=>{const button=$('vm-syscom-toggle'),menu=$('vm-syscom-menu'),open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)refreshConnection();});
  $('vm-syscom-close').addEventListener('click',()=>closeConnectionMenu(true));
  document.addEventListener('click',event=>{if(!$('vm-extension-control').contains(event.target))closeConnectionMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('vm-syscom-menu').hidden){event.preventDefault();closeConnectionMenu(true);}});
  $('vm-extension-control').addEventListener('focusout',event=>{if(event.relatedTarget&&!$('vm-extension-control').contains(event.relatedTarget))closeConnectionMenu();});
  $('vm-syscom-refresh').addEventListener('click',refreshConnection);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();else refreshConnection();});
  window.addEventListener('pagehide',saveDraft);
  for(const [key,id] of Object.entries(settingsFields)){$(id).value=String(state.settings[key]);$(id).addEventListener(key==='rounding'?'change':'input',()=>{state.settings[key]=$(id).value;invalidate();update();});}
  for(const key of ['client','project'])$('vm-'+key).addEventListener('input',()=>{state[key]=$('vm-'+key).value;invalidate();update();});
  for(const section of Object.keys(names))$('vm-add-'+section).addEventListener('click',()=>addRow(section,true));
  for(const [id,open] of [['vm-collapse-equipment',false],['vm-expand-equipment',true]])$(id).addEventListener('click',()=>{for(const item of state.equipment)rowNodes.get(item.id).details.open=open;saveDraft();});
  for(const section of tabs){const button=$('vm-tab-'+section);button.addEventListener('click',()=>selectTab(section));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.indexOf(section),target=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectTab(tabs[target],{focus:true});});}
  $('vm-review-issues').addEventListener('click',()=>{const validation=validateMatrix(state);if(validation.issues.length)reviewIssue(validation.issues[0]);});
  $('vm-clear-draft').addEventListener('click',()=>{if(busy||lookupCurrent)return;saveDraft();$('vm-clear-dialog').showModal();});
  $('vm-clear-cancel').addEventListener('click',()=>$('vm-clear-dialog').close());
  $('vm-clear-confirm').addEventListener('click',clearDraft);
  root.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||lookupCurrent)return;const validation=validateMatrix(state);if(!validation.valid){$('vm-error').textContent=validation.issues[0].message;$('vm-error').hidden=false;reviewIssue(validation.issues[0]);return;}
    busy=true;invalidate();root.setAttribute('aria-busy','true');root.querySelectorAll('input,textarea,select,button').forEach(control=>control.disabled=true);update();
    try{
      // Capture the creation time here, rather than when the user starts filling the form.
      const result=await buildMatrixWorkbook(structuredClone(state),new Date());downloadBlob(result.blob,result.name+'.xlsx');
      $('vm-filename').textContent=result.name+'.xlsx';$('vm-folio-help').textContent='Folio de la última matriz: '+result.folio;
      $('vm-success').textContent=`Excel creado con ${result.sheets.length} hojas. Los totales, fórmulas y referencias están incluidos.`;$('vm-success').hidden=false;
    }catch(error){console.error(error);$('vm-error').textContent=error.message||'No se pudo generar la matriz. Revisa los datos e inténtalo de nuevo.';$('vm-error').hidden=false;}
    finally{busy=false;root.setAttribute('aria-busy','false');root.querySelectorAll('input,textarea,select,button').forEach(control=>control.disabled=false);const filename=$('vm-filename').textContent;update();if(!$('vm-success').hidden)$('vm-filename').textContent=filename;}
  });
  syncMainFields();
  if(recovered.status==='restored'){
    for(const section of Object.keys(names)){
      rows(section).forEach((item,index)=>{nextId=Math.max(nextId,Number(item.id.slice(section.length+1)));renderRow(section,item,index);});relabel(section);
    }
    for(const item of state.equipment){
      const node=rowNodes.get(item.id),saved=recovered.draft.ui.equipment[item.id];node.details.open=saved.open;node.pricePending=saved.pricePending;
      if(saved.pricePending)node.lookupMessage.textContent='El precio de SYSCOM sigue pendiente. Consulta el modelo de nuevo o usa captura manual.';
    }
    draftStatus('Borrador recuperado de este navegador.');update();
  }else{
    addRow('equipment');for(const section of ['labor','volume','miscellaneous'])relabel(section);
    draftStatus(recovered.status==='invalid'?'No se pudo recuperar el borrador guardado. Puedes continuar o limpiar los datos.':recovered.status==='unavailable'?'El guardado local no está disponible en este navegador. Los datos se conservan solo mientras esta página esté abierta.':'Los cambios se guardan automáticamente en este navegador.',recovered.status!=='empty');
  }
  selectTab(activeTab,{save:false});lastDraftSnapshot=draftSnapshot();savingReady=true;refreshConnection();
}
