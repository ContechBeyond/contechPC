import test from 'node:test';
import assert from 'node:assert/strict';
import {preservedSheets} from '../vf-core.js';

test('la VF de solo equipo conserva resumen y matriz sin exigir mano de obra',()=>{
  assert.deepEqual(preservedSheets(['Cliente','Matriz','Resumen Costos','Volumetria']),['Resumen Costos','Matriz']);
  assert.deepEqual(preservedSheets(['Matriz','Resumen']),['Resumen','Matriz']);
});
test('cuando existe mano de obra, la conserva en tercer lugar con su nombre original',()=>{
  assert.deepEqual(preservedSheets(['MANO DE OBRA','Cliente','  Resumen  ','MATRIZ']),['  Resumen  ','MATRIZ','MANO DE OBRA']);
});
test('resumen y matriz siguen siendo necesarios y las hojas ambiguas requieren revisión',()=>{
  assert.throws(()=>preservedSheets(['Matriz']),/No se encontró.*Resumen Costos/);
  assert.throws(()=>preservedSheets(['Resumen Costos']),/No se encontró.*Matriz/);
  assert.throws(()=>preservedSheets(['Resumen Costos','Resumen','Matriz']),/Hay dos hojas/);
  assert.throws(()=>preservedSheets(['Resumen','Matriz','Mano de Obra','MANO DE OBRA']),/Hay dos hojas/);
});
