import {describe,it,expect} from 'vitest';
import {validateProductEvent,CONFIRMED_OUTCOMES} from './eventCatalog';
describe('product event boundary',()=>{
 it('accepts an unavailable technical SDK session without losing a confirmed outcome',()=>{
  expect(validateProductEvent('ui_action_outcome',{operation:'energy_save',outcome:'succeeded',session_id:null})).toMatchObject({valid:true});
 });
 it('rejects unknown events and invalid measurements rather than coercing them',()=>{
  expect(validateProductEvent('clinical text')).toMatchObject({valid:false});
  expect(validateProductEvent('ui_action_outcome',{duration_ms:NaN})).toMatchObject({valid:false});
  expect(validateProductEvent('ui_action_outcome',{outcome:'saved maybe'})).toMatchObject({valid:false});
 });
 it('drops unknown nested clinical data and never mutates the caller',()=>{
  const input={operation:'meal_plan_apply',outcome:'succeeded',unknown:{diagnosis:'private'},duration_ms:80};
  expect(validateProductEvent('ui_action_outcome',input)).toEqual({valid:true,event:'ui_action_outcome',properties:{operation:'meal_plan_apply',outcome:'succeeded',duration_ms:80}});
  expect(input.unknown.diagnosis).toBe('private');
 });
 it('maps only completed work to canonical outcomes',()=>{
  expect(CONFIRMED_OUTCOMES).toEqual({anthropometry_save:'anthropometry_saved',energy_save:'energy_calc_performed',meal_plan_apply:'meal_plan_published'});
 });
});
