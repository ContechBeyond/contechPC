// Coordinates are PDF points on the existing Letter-size Contech cover.
// Reserve the date and folio areas before fitting the editable text.
const BOXES=[
  {x:122,y:367.2,width:196,height:74,minSize:14,dateX:183.8,dateY:452.8,titleX:129.1,titleWidth:null},
  {x:232,y:367.2,width:308,height:142,minSize:11,dateX:232,dateY:519,titleX:232,titleWidth:308}
];
function wrap(text,width,size,measure){
  const lines=[];let line='';
  for(const word of String(text??'').trim().split(/\s+/).filter(Boolean)){
    const combined=line?line+' '+word:word;
    if(measure(combined,size)<=width){line=combined;continue;}
    if(line){lines.push(line);line='';}
    for(const character of word){
      if(line&&measure(line+character,size)>width){lines.push(line);line='';}
      line+=character;
    }
  }
  if(line)lines.push(line);
  return lines;
}
export function layoutProposalCover(project,client,measure){
  for(const box of BOXES){
    for(let fontSize=20;fontSize>=box.minSize;fontSize-=.5){
      // A small width reserve absorbs differences between canvas and PDF shaping.
      const projectLines=wrap(project,box.width-4,fontSize,measure),clientLines=wrap(client,box.width-4,fontSize,measure),advance=fontSize*1.32,gap=8;
      const height=(projectLines.length+clientLines.length)*advance+gap;
      if(height>box.height)continue;
      const lines=[...projectLines.map((text,i)=>({text,y:box.y+i*advance})),...clientLines.map((text,i)=>({text,y:box.y+projectLines.length*advance+gap+i*advance}))];
      return {...box,fontSize,advance,gap,lines,projectLines,clientLines,bottom:box.y+height};
    }
  }
  throw new Error('El nombre del proyecto y del cliente es demasiado largo para la portada. Acórtalos para conservar su legibilidad.');
}
export function proposalCoverContent(data,date,measure){
  const layout=layoutProposalCover(data.project,data.client,measure);
  const centered=(text,x,y,width,fontSize)=>({columns:[{width,text,noWrap:true}],fontSize,bold:true,color:'white',alignment:'center',absolutePosition:{x,y}});
  return [
    layout.titleWidth?centered('PROPUESTA COMERCIAL',layout.titleX,327.4,layout.titleWidth,20):{text:'PROPUESTA COMERCIAL',bold:true,color:'white',fontSize:20,absolutePosition:{x:129.1,y:327.4}},
    ...layout.lines.map(line=>centered(line.text,layout.x,line.y,layout.width,layout.fontSize)),
    layout.titleWidth?centered(date,layout.dateX,layout.dateY,layout.width,12):{text:date,fontSize:12,bold:true,color:'white',absolutePosition:{x:layout.dateX,y:layout.dateY}},
    centered('Folio:  '+data.folio,72,541,468,10)
  ];
}
