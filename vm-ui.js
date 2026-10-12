import {VM_DEFAULTS,VM_MAX_ITEMS,validateMatrix,calculateMatrix,vmNumber,matrixBookName} from './vm-core.js';
import {buildMatrixWorkbook} from './vm-xlsx.js';
import {money} from './core.js';
import {downloadBlob} from './exporters.js';
let initialized=false;
export function initMatrixBuilder(){
  if(initialized)return;initialized=true;
  const $=id=>document.getElementById(id),root=$('vm-form');
  const state={client:'',project:'',settings:{...VM_DEFAULTS},equipment:[],labor:{enabled:false,items:[]},volume:{enabled:false,items:[]},miscellaneous:{enabled:false,items:[]}};
  let nextId=0,busy=false;
  const rowNodes=new Map(),names={equipment:'Equipo',labor:'Servicio',volume:'Material',miscellaneous:'Consumible'};
  const settingsFields={exchangeRate:'vm-exchange-rate',indirectPct:'vm-indirect-pct',feePct:'vm-fee-pct',commissionPct:'vm-commission-pct',provisionPct:'vm-provision-pct',rounding:'vm-rounding'};
  const rows=section=>section==='equipment'?state.equipment:state[section].items;
  const format=value=>Number.isFinite(value)?money(Math.round(value*100)):'—';
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function invalidate(){ $('vm-error').hidden=true;$('vm-success').hidden=true;$('vm-folio-help').textContent='El folio se genera al crear el archivo, con hora, minutos, día, mes y año de Ciudad de México.';}
  function field(section,item,key,label,{wide=false,metadata=false,required=true,max=100,numeric=false,textarea=false,options}={}){
    const wrapper=element('label','field'+(wide?' vm-field-wide':'')+(metadata?' vm-field-metadata':'')),caption=element('span','',label);
    if(required){const mark=element('span','required',' *');caption.append(mark);}wrapper.append(caption);
    const control=element(options?'select':textarea?'textarea':'input');control.id=`vm-${item.id}-${key}`;control.dataset.key=key;control.required=required;
    if(textarea){control.rows=3;control.maxLength=max;}else if(!options){control.type='text';control.maxLength=max;control.autocomplete='off';if(numeric)control.inputMode='decimal';}
    if(options)for(const [value,title] of options){const option=element('option','',title);option.value=value;control.append(option);}
    control.value=item[key]??'';
    control.addEventListener(options?'change':'input',()=>{item[key]=control.value;invalidate();if(section==='equipment')refreshVolumeChoices();update();});wrapper.append(control);return wrapper;
  }
  function renderRow(section,item,index){
    const block=element('fieldset','vm-item');block.dataset.item=item.id;block.append(element('legend','',names[section]+' '+(index+1)));
    const bar=element('div','vm-item-toolbar'),total=element('output','vm-item-total','Costo directo: —'),remove=element('button','icon-button');remove.type='button';remove.setAttribute('aria-label',`Eliminar ${names[section].toLowerCase()} ${index+1}`);remove.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg>';
    remove.addEventListener('click',()=>{rows(section).splice(rows(section).indexOf(item),1);rowNodes.delete(item.id);block.remove();relabel(section);refreshVolumeChoices();invalidate();update();const next=$('vm-'+section+'-list').querySelector('input,textarea,select');(next||$('vm-add-'+section)).focus();});bar.append(total,remove);block.append(bar);
    const grid=element('div','vm-item-grid');
    grid.append(field(section,item,'concept','Concepto',{wide:true,max:180}),field(section,item,'description','Descripción',{wide:true,textarea:true,max:section==='miscellaneous'?600:1200}));
    if(section==='equipment')for(const [key,label] of [['model','Modelo'],['brand','Marca'],['supplier','Proveedor']])grid.append(field(section,item,key,label,{metadata:true}));
    grid.append(field(section,item,'quantity','Cantidad',{numeric:true,max:30}));
    if(section==='volume')grid.append(field(section,item,'unit','Unidad',{max:20}));
    grid.append(field(section,item,'unitCost',section==='equipment'?'Precio de compra unitario':'Precio unitario MXN',{numeric:true,max:30}));
    if(section==='equipment')grid.append(field(section,item,'currency','Moneda',{options:[['USD','USD'],['MXN','MXN']]}));
    let source,units;
    if(section==='volume'){
      const sourceField=field(section,item,'sourceEquipment','Precio del material',{wide:true,required:false,options:[['','Capturar precio manual']]}),unitsField=field(section,item,'unitsPerPack','Unidades por presentación del equipo',{wide:true,numeric:true,max:30});
      source=sourceField.querySelector('select');units=unitsField;unitsField.append(element('small','','Ej. 152 metros por bobina. El precio se toma del equipo y se divide entre estas unidades.'));grid.append(sourceField,unitsField);
    }
    block.append(grid);$('vm-'+section+'-list').append(block);rowNodes.set(item.id,{block,total,source,units,cost:grid.querySelector('[data-key="unitCost"]')});
    refreshVolumeChoices();return block;
  }
  function relabel(section){const items=rows(section);items.forEach((item,i)=>{const node=rowNodes.get(item.id);node.block.querySelector('legend').textContent=names[section]+' '+(i+1);node.block.querySelector('button').setAttribute('aria-label',`Eliminar ${names[section].toLowerCase()} ${i+1}`);});
    const list=$('vm-'+section+'-list');list.querySelector('.vm-empty-list')?.remove();if(!items.length)list.append(element('p','vm-empty-list','Agrega una partida para incluirla en la matriz.'));
  }
  function addRow(section,focus=false){
    if(rows(section).length>=VM_MAX_ITEMS)return;
    const item={id:section+'-'+(++nextId),concept:'',description:'',quantity:'1',unitCost:'',model:'',brand:'',supplier:'',currency:'USD',unit:'m',sourceEquipment:'',unitsPerPack:''};rows(section).push(item);$('vm-'+section+'-list').querySelector('.vm-empty-list')?.remove();const node=renderRow(section,item,rows(section).length-1);invalidate();update();if(focus)node.querySelector('input').focus();
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
    for(const [section,name] of Object.entries(names)){
      $('vm-add-'+section).disabled=busy||rows(section).length>=VM_MAX_ITEMS;
      for(const item of rows(section)){
        const node=rowNodes.get(item.id),cost=rowCost(section,item);node.total.textContent='Costo directo: '+format(cost.total);
        if(section==='volume'){const linked=Boolean(item.sourceEquipment);node.units.hidden=!linked;node.units.querySelector('input').required=linked;node.cost.readOnly=linked;node.cost.value=linked&&Number.isFinite(cost.unit)?String(cost.unit):linked?'':item.unitCost;}
      }
    }
    const result=validateMatrix(state);let calculation;
    if(result.valid)try{calculation=calculateMatrix(state);}catch(error){result.valid=false;result.issues.push({message:error.message});}
    const count=state.equipment.length+(state.labor.enabled?state.labor.items.length:0)+(state.miscellaneous.enabled&&state.miscellaneous.items.length?1:0);
    $('vm-item-count').textContent=String(count);
    $('vm-filename').textContent=matrixBookName(state.client.trim()||'Cliente',state.project.trim()||'Proyecto','000000000000').replace(/000000000000$/,'[folio automático]')+'.xlsx';
    for(const [id,value] of [['vm-direct-total',calculation?.totals.direct],['vm-labor-total',calculation?.laborDirect],['vm-misc-total',calculation?.miscDirect],['vm-sale-total',calculation?.totals.total]])$(id).textContent=format(value);
    $('vm-download').disabled=busy||!result.valid;$('vm-download').textContent=busy?'Preparando Excel…':'Crear y descargar Excel VM';
    const status=$('vm-ready-status');status.classList.toggle('ready',result.valid);status.textContent=busy?'Preparando las hojas y sus fórmulas…':result.valid?'Lista para generar el Excel con fórmulas y referencias.':result.issues.slice(0,2).map(issue=>issue.message).join(' ');
  }
  for(const [key,id] of Object.entries(settingsFields)){$(id).value=String(state.settings[key]);$(id).addEventListener(key==='rounding'?'change':'input',()=>{state.settings[key]=$(id).value;invalidate();update();});}
  for(const key of ['client','project'])$('vm-'+key).addEventListener('input',()=>{state[key]=$('vm-'+key).value;invalidate();update();});
  for(const section of Object.keys(names))$('vm-add-'+section).addEventListener('click',()=>addRow(section,true));
  for(const section of ['labor','volume','miscellaneous'])$('vm-enable-'+section).addEventListener('change',()=>{state[section].enabled=$('vm-enable-'+section).checked;$('vm-'+section+'-section').hidden=!state[section].enabled;if(state[section].enabled&&!rows(section).length)addRow(section);invalidate();update();});
  root.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const validation=validateMatrix(state);if(!validation.valid){$('vm-error').textContent=validation.issues[0].message;$('vm-error').hidden=false;return;}
    busy=true;invalidate();root.setAttribute('aria-busy','true');root.querySelectorAll('input,textarea,select,button').forEach(control=>control.disabled=true);update();
    try{
      // Capture the creation time here, rather than when the user starts filling the form.
      const result=await buildMatrixWorkbook(structuredClone(state),new Date());downloadBlob(result.blob,result.name+'.xlsx');
      $('vm-filename').textContent=result.name+'.xlsx';$('vm-folio-help').textContent='Folio de la última matriz: '+result.folio;
      $('vm-success').textContent=`Excel creado con ${result.sheets.length} hojas. Los totales, fórmulas y referencias están incluidos.`;$('vm-success').hidden=false;
    }catch(error){console.error(error);$('vm-error').textContent=error.message||'No se pudo generar la matriz. Revisa los datos e inténtalo de nuevo.';$('vm-error').hidden=false;}
    finally{busy=false;root.setAttribute('aria-busy','false');root.querySelectorAll('input,textarea,select,button').forEach(control=>control.disabled=false);const filename=$('vm-filename').textContent;update();if(!$('vm-success').hidden)$('vm-filename').textContent=filename;}
  });
  addRow('equipment');
}
