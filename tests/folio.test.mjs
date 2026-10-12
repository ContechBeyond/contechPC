import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedFolio} from '../core.js';
import {finalBookName} from '../vf-core.js';

test('folios de los ejemplos VM y VF, separados o unidos a la versión',()=>{
  for(const version of ['VM','VF']){
    for(const gap of ['',' ','-','_']){
      assert.equal(suggestedFolio(`Tabachines - Camaras ${version}${gap}163906102026.xlsx`),'163906102026');
      assert.equal(suggestedFolio(`Tabachines - Videoportero ${version}${gap}161201102026`),'161201102026');
    }
  }
});
test('posición variable, copias y ceros iniciales',()=>{
  assert.equal(suggestedFolio('161201102026 Tabachines - Videoportero VM'),'161201102026');
  assert.equal(suggestedFolio('Tabachines 161201102026 - Videoportero VF (4).xlsx'),'161201102026');
  assert.equal(suggestedFolio('Cliente - Proyecto VM083906102026.xlsx'),'083906102026');
  assert.equal(suggestedFolio('161201102026 Proyecto 161201102026'),'161201102026');
});
test('no extrae fragmentos de números con otra longitud',()=>{
  for(const name of ['Proyecto VM 16390610202','Proyecto VF1639061020260','Proyecto 1234567890123456','Proyecto.xlsx','',null])assert.equal(suggestedFolio(name),'');
});
test('prefiere un folio identificado por versión y no adivina si hay dos',()=>{
  assert.equal(suggestedFolio('Cliente 111111111111 - Proyecto VM163906102026'),'163906102026');
  assert.equal(suggestedFolio('Proyecto 163906102026 161201102026'),'');
  assert.equal(suggestedFolio('Proyecto VM163906102026 VF161201102026'),'');
});
test('la conversión VF también admite VM pegado al folio sin alterar sus dígitos',()=>{
  assert.equal(finalBookName('Tabachines - Camaras VM163906102026.xlsx'),'Tabachines - Camaras VF163906102026');
  assert.equal(finalBookName('Tabachines - Videoportero VM 161201102026 (4).xlsx'),'Tabachines - Videoportero VF 161201102026 (4)');
  assert.equal(finalBookName('Proyecto_VM083906102026.xlsx'),'Proyecto_VF083906102026');
  assert.throws(()=>finalBookName('Proyecto AVM163906102026.xlsx'));
  assert.throws(()=>finalBookName('Proyecto VM1639061020260.xlsx'));
});
