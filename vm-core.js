import {decimalString} from './core.js';

export const VM_DEFAULTS=Object.freeze({exchangeRate:19,indirectPct:21.6,feePct:50,commissionPct:5,provisionPct:3,rounding:'precision'});
export const VM_MAX_ITEMS=200;
export const vmNumber=value=>{const text=decimalString(value,'quantity');return text?Number(text):NaN;};
const text=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
export const vmIsBlank=value=>!text(value);
const optionalNumber=value=>vmIsBlank(value)?0:vmNumber(value);
const active=section=>section?.enabled?section.items||[]:[];
export const miscellaneousText=item=>[text(item.concept),text(item.description)||'-'].join('\n');

export function matrixFolio(when=new Date()){
  if(!(when instanceof Date)||!Number.isFinite(when.getTime()))throw new Error('La fecha de creación no es válida.');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(when);
  const get=type=>parts.find(part=>part.type===type).value;
  return ['hour','minute','day','month','year'].map(get).join('');
}
export function matrixBookName(client,project,folio){
  const safe=value=>text(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim();
  if(!safe(client)||!safe(project)||!/^\d{12}$/.test(folio))throw new Error('Completa cliente y proyecto para dar nombre a la matriz.');
  return `${safe(client)} - ${safe(project)} VM ${folio}`;
}
export function validateMatrix(data){
  const issues=[],add=(path,message)=>issues.push({path,message});
  const requiredText=(value,path,label,max)=>{if(!text(value))add(path,`Completa ${label}.`);else if(text(value).length>max)add(path,`${label}: usa hasta ${max} caracteres.`);};
  const optionalText=(value,path,label,max)=>{if(text(value).length>max)add(path,`${label}: usa hasta ${max} caracteres.`);};
  const number=(value,path,label,positive=false,max=1000000000)=>{const n=vmNumber(value);if(!Number.isFinite(n)||n<0||(positive&&n===0)||n>max)add(path,`${label}: indica ${positive?'un número mayor que cero':'un número igual o mayor que cero'} de hasta ${max.toLocaleString('es-MX')}.`);};
  const optional=(value,...args)=>{if(!vmIsBlank(value))number(value,...args);};
  requiredText(data.client,'client','el nombre del cliente',90);requiredText(data.project,'project','el nombre del proyecto',90);
  const settings=data.settings||{};
  number(settings.exchangeRate,'settings.exchangeRate','Tipo de cambio',true,10000);
  for(const [key,label] of [['indirectPct','Indirectos'],['feePct','Fee'],['commissionPct','Comisión'],['provisionPct','Aprovisionamiento']])number(settings[key],'settings.'+key,label,false,1000);
  if(!['precision','unit-rounded'].includes(settings.rounding))add('settings.rounding','Selecciona el criterio de redondeo.');
  const equipment=data.equipment||[],labor=active(data.labor),misc=active(data.miscellaneous),volume=active(data.volume);
  if(!equipment.length&&!labor.length&&!misc.length)add('equipment','Agrega al menos un equipo o una partida de mano de obra o misceláneos.');
  if(equipment.length+labor.length+(misc.length?1:0)>VM_MAX_ITEMS)add('equipment',`La Matriz y Cliente admiten hasta ${VM_MAX_ITEMS} conceptos.`);
  for(const [name,items,label] of [['equipment',equipment,'Equipo'],['labor',labor,'Mano de obra'],['miscellaneous',misc,'Misceláneo'],['volume',volume,'Volumetría']]){
    if(name!=='equipment'&&data[name]?.enabled&&!items.length)add(name,`Agrega una partida de ${label.toLowerCase()} o desactiva la sección.`);
    if(items.length>VM_MAX_ITEMS)add(name,`La sección admite hasta ${VM_MAX_ITEMS} partidas.`);
    const ids=new Set();
    items.forEach((item,i)=>{
      const prefix=name+'.'+i,labelRow=`${label} ${i+1}`;
      if(!item.id||ids.has(item.id))add(prefix+'.id',`${labelRow}: el identificador de la partida no es válido.`);ids.add(item.id);
      requiredText(item.concept,prefix+'.concept',`el concepto de ${labelRow.toLowerCase()}`,180);
      optionalText(item.description,prefix+'.description',`La descripción de ${labelRow.toLowerCase()}`,name==='miscellaneous'?600:1200);
      optional(item.quantity,prefix+'.quantity',`${labelRow}, cantidad`,true,1000000);
      if(name==='equipment'){
        for(const [key,field] of [['model','Modelo'],['brand','Marca'],['supplier','Proveedor']])optionalText(item[key],prefix+'.'+key,`${field} del equipo ${i+1}`,100);
        if(!vmIsBlank(item.currency)&&!['USD','MXN'].includes(item.currency))add(prefix+'.currency',`${labelRow}: selecciona USD o MXN.`);
      }
      if(name==='volume'){
        optionalText(item.unit,prefix+'.unit',`La unidad de volumetría ${i+1}`,20);
        if(item.sourceEquipment){
          if(!equipment.some(e=>e.id===item.sourceEquipment))add(prefix+'.sourceEquipment',`${labelRow}: el equipo vinculado ya no existe. Elige otro equipo o usa precio manual.`);
          optional(item.unitsPerPack,prefix+'.unitsPerPack',`${labelRow}, unidades por presentación`,true,1000000);
        }else optional(item.unitCost,prefix+'.unitCost',`${labelRow}, precio unitario`);
      }else optional(item.unitCost,prefix+'.unitCost',`${labelRow}, precio unitario`);
    });
  }
  if(misc.map(miscellaneousText).join('\n').length>2400)add('miscellaneous','El descriptivo conjunto de misceláneos supera 2.400 caracteres. Acórtalo para conservarlo completo en Cliente y la propuesta.');
  return {valid:issues.length===0,issues};
}

// Excel-compatible positive ROUND for the optional selling-unit-price criterion.
const shift=(value,places)=>{const [coefficient,exponent='0']=String(value).split('e');return Number(coefficient+'e'+(Number(exponent)+places));};
const roundUnit=value=>shift(Math.round(shift(value,2)),-2);
export function calculateMatrix(data){
  const validation=validateMatrix(data);
  if(!validation.valid)throw new Error(validation.issues[0].message);
  const s=Object.fromEntries(Object.entries(data.settings).map(([key,value])=>[key,key==='rounding'?value:vmNumber(value)]));
  const rates={indirect:s.indirectPct/100,fee:s.feePct/100,commission:s.commissionPct/100,provision:s.provisionPct/100};
  const labor=active(data.labor),misc=active(data.miscellaneous),volume=active(data.volume),entries=[];
  function append(item,kind,sourceIndex,mxnCost,costMissing=vmIsBlank(item.unitCost)){
    const quantityMissing=vmIsBlank(item.quantity),quantity=optionalNumber(item.quantity),complete=!quantityMissing&&!costMissing,direct=quantity*mxnCost,indirect=direct*rates.indirect,integrated=direct+indirect,fee=integrated*rates.fee,withFee=integrated+fee,commission=withFee*rates.commission,provision=withFee*rates.provision;
    const total=s.rounding==='unit-rounded'?quantity*roundUnit(mxnCost*(1+rates.indirect)*(1+rates.fee)*(1+rates.commission+rates.provision)):withFee+commission+provision;
    const entry={...item,concept:text(item.concept),description:text(item.description),kind,sourceIndex,row:5+entries.length,quantity,quantityMissing,costMissing,complete,mxnCost,usdCost:kind==='equipment'&&item.currency==='USD'?optionalNumber(item.unitCost):mxnCost/s.exchangeRate,direct,indirect,integrated,fee,withFee,commission,provision,total,sellingUnit:quantity>0?total/quantity:0};
    if(!Object.values(entry).filter(value=>typeof value==='number').every(Number.isFinite))throw new Error('Los importes calculados exceden los valores admitidos. Revisa cantidades, precios y porcentajes.');
    entries.push(entry);return entry;
  }
  (data.equipment||[]).forEach((item,i)=>{const currency=text(item.currency)||'USD';append({...item,currency},'equipment',i,optionalNumber(item.unitCost)*(currency==='USD'?s.exchangeRate:1));});
  labor.forEach((item,i)=>append(item,'labor',i,optionalNumber(item.unitCost)));
  const miscDirect=misc.reduce((sum,item)=>sum+optionalNumber(item.quantity)*optionalNumber(item.unitCost),0),miscComplete=misc.some(item=>!vmIsBlank(item.quantity)&&!vmIsBlank(item.unitCost));
  if(misc.length)append({id:'miscellaneous-total',concept:'Misceláneos',description:misc.map(miscellaneousText).join('\n'),quantity:1},'miscellaneous',0,miscDirect,!miscComplete);
  const totalRow=entries.at(-1).row+4;
  const totals=Object.fromEntries(['direct','indirect','integrated','fee','withFee','commission','provision','total'].map(key=>[key,entries.reduce((sum,entry)=>sum+entry[key],0)]));
  const volumes=volume.map(item=>{
    const source=entries.find(entry=>entry.id===item.sourceEquipment&&entry.kind==='equipment');
    const quantityMissing=vmIsBlank(item.quantity),costMissing=source?source.costMissing||vmIsBlank(item.unitsPerPack):vmIsBlank(item.unitCost);
    const unitCost=costMissing?0:source?source.mxnCost/vmNumber(item.unitsPerPack):vmNumber(item.unitCost),quantity=optionalNumber(item.quantity);
    return {...item,quantity,quantityMissing,costMissing,complete:!quantityMissing&&!costMissing,unitCost,direct:quantity*unitCost,sourceRow:source?.row};
  });
  return {entries,totals,totalRow,rates,settings:s,labor,misc,miscDirect,miscComplete,volumes,volumeDirect:volumes.reduce((sum,item)=>sum+item.direct,0),laborDirect:labor.reduce((sum,item)=>sum+optionalNumber(item.quantity)*optionalNumber(item.unitCost),0)};
}
