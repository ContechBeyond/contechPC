import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutProposalCover,proposalCoverContent} from '../proposal-cover.js';
const measure=(text,size)=>[...text].reduce((sum,char)=>sum+(char==='W'?.9:char===' '?.23:.52)*size,0);

for(const [name,project,client] of [
  ['nombre corto','Videoportero','Tabachines'],
  ['caso reportado','Ventiladores para Gabinete','Origina Pedregal Torre A'],
  ['nombres extensos','Instalación de sistemas de videovigilancia y control de acceso para áreas comunes','Administración del Condominio Residencial Jardines de la Montaña Torre Norte y Estacionamiento de Visitantes'],
  ['máximos sin espacios','W'.repeat(90),'W'.repeat(120)]
])test('portada sin superposición: '+name,()=>{
  const layout=layoutProposalCover(project,client,measure);
  assert.ok(layout.fontSize>=11&&layout.fontSize<=20);
  assert.ok(layout.bottom+8<=layout.dateY,'La fecha tiene un espacio reservado.');
  assert.ok(layout.dateY+12*1.32+5<541,'La fecha no invade el folio.');
  assert.equal(layout.projectLines.join('').replace(/\s/g,''),project.replace(/\s/g,''));
  assert.equal(layout.clientLines.join('').replace(/\s/g,''),client.replace(/\s/g,''));
  for(const line of layout.lines){assert.ok(measure(line.text,layout.fontSize)<=layout.width);assert.ok(line.y>=367.2);}
  for(let i=1;i<layout.lines.length;i++)assert.ok(layout.lines[i].y-layout.lines[i-1].y>=layout.advance-1e-8);
});
test('la portada corta conserva tamaño y posiciones del formato Contech',()=>{
  const layout=layoutProposalCover('Videoportero','Tabachines',measure);
  assert.equal(layout.fontSize,20);assert.equal(layout.x,122);assert.equal(layout.dateY,452.8);
});
test('el generador usa líneas explícitas, fecha mes/año y folio separados',()=>{
  const data={project:'Ventiladores para Gabinete',client:'Origina Pedregal Torre A',folio:'132314102026'};
  const content=proposalCoverContent(data,'Octubre 2026',measure),layout=layoutProposalCover(data.project,data.client,measure);
  assert.equal(content.length,layout.lines.length+3);assert.equal(content[0].text,'PROPUESTA COMERCIAL');
  assert.equal(content.at(-2).text,'Octubre 2026');assert.equal(content.at(-1).columns[0].text,'Folio:  132314102026');
  for(const node of content.slice(1,-2))assert.equal(node.columns[0].noWrap,true);
});
test('rechaza textos fuera de capacidad en lugar de recortarlos o encimarlos',()=>{
  assert.throws(()=>layoutProposalCover('W'.repeat(2000),'W'.repeat(2000),measure),/demasiado largo/);
});
