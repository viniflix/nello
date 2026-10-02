import {describe,it,expect} from 'vitest';
import {energyDocument,canonicalDocument,storedClinicalDocument} from '../../../supabase/functions/_shared/clinical-document.js';
import {calculateEnergyPlan} from './energy-planning';
const input={weight_kg:70,height_cm:175,age_years:30,sex:'M',clinical_mobility:'ambulatory',mobility_factor:1.3,injury_factor:1.4,injury_factor_id:'peritonitis',activity_factor:1,venta_target_weight:69,venta_timeframe_days:21};
const plan=calculateEnergyPlan({weight:70,height:175,age:30,gender:'M',protocol:'harris',clinicalMobility:'ambulatory',injuryFactor:1.4,injuryFactorId:'peritonitis',targetWeight:69,timeframeDays:21});
const saved={id:'10000000-0000-4000-8000-000000000010',patient_id:'synthetic',weight:70,height:175,age:30,gender:'M',tmb_protocol:'harris',tmb_result:plan.tmbResult,get_result:plan.getResult,final_planned_kcal:plan.finalPlannedKcal,venta_adjustment_kcal:plan.ventaAdjustmentKcal,input_snapshot:input,source_snapshot:{engine_version:6},output_snapshot:{calculation_details:plan}};
describe('clinical documents are projections of saved immutable evaluations',()=>{
 it('keeps the exact same rounded result and written operands in the PDF',()=>{
  const document=energyDocument(saved);
  expect(document.lines).toContain('GET: 3097.66 kcal/dia');
  expect(document.lines).toContain('VET: 2731.00 kcal/dia');
  expect(document.lines).toContain(plan.finalEquation);
  expect(document.lines).toContain(plan.appliedTotal);
 });
 it('refuses inconsistent current audit rather than silently rendering forged results',()=>{
  expect(()=>energyDocument({...saved,get_result:100})).toThrow('integrity');
  const tampered=structuredClone(saved);tampered.output_snapshot.calculation_details.exactResults.planned.numerator='1';
  expect(()=>energyDocument(tampered)).toThrow('integrity');
 });
 it('preserves historical numbers and text without replacing a legacy formula',()=>{
  const document=energyDocument({...saved,source_snapshot:{engine_version:3},get_result:1234.56,final_planned_kcal:1230,output_snapshot:{}});
  expect(document.lines).toContain('GET: 1234.56 kcal/dia');expect(document.lines).toContain('VET: 1230 kcal/dia');
 });
 it('rejects absent canonical records and limits nested content',()=>{
  expect(()=>energyDocument({})).toThrow();expect(()=>canonicalDocument({})).toThrow();
  let content='x';for(let i=0;i<14;i++)content={nested:content};
  expect(()=>canonicalDocument({id:saved.id,sha256:'fake',canonical_payload:{content}})).toThrow('deep');
 });
 it('renders safe text and retains identity, status and the canonical hash',()=>{
  const doc=canonicalDocument({id:saved.id,status:'signed',sha256:'a'.repeat(64),canonical_payload:{professional:{name:'Synthetic'},patient:{name:'Example'},content:{title:'Prescrição',notes:'<p>Observação &amp; revisão</p>'}}});
  expect(doc.title).toBe('Prescrição');expect(doc.lines.join('\n')).toContain('Observação & revisão');
  expect(doc.lines.join('\n')).toContain('Status: signed');expect(doc.lines.join('\n')).toContain('a'.repeat(64));
 });
 it('accepts database JSON key ordering while checking every numeric result',()=>{
  const row=structuredClone(saved);row.source_snapshot.engine_version='6';
  row.output_snapshot.calculation_details.exactResults=Object.fromEntries(Object.entries(plan.exactResults).reverse());
  expect(energyDocument(row).lines).toContain('GET: 3097.66 kcal/dia');
  for(const field of ['tmb_result','get_result','venta_adjustment_kcal','final_planned_kcal'])expect(()=>energyDocument({...row,[field]:null})).toThrow('integrity');
 });
 it('retains available historical provenance and marks missing results explicitly',()=>{
  const doc=energyDocument({id:12,patient_id:'synthetic',protocol:'historical',source_snapshot:{clinical_factor_reference:{title:'Stored protocol',url:'https://example.invalid/reference'}},output_snapshot:{calculation_details:{formula:{formulaName:'Stored formula'}}}});
  expect(doc.lines).toContain('TMB: Não registrado kcal/dia');expect(doc.lines.join('\n')).toContain('Stored protocol');
 });
 it('preserves structured canonical arrays and optional signing details as safe text',()=>{
  const doc=canonicalDocument({id:13,status:'signed',sha256:'a'.repeat(64),signed_at:'2026-10-02',authenticity_code:'synthetic-code',canonical_payload:{professional:{clinic_name:'Synthetic Clinic',name:'Synthetic',normalized_crn:'QA'},patient:{name:'Example',birth_date:'2000-01-01'},content:{notes:[null,'first',{detail:'second'}]}}});
  expect(doc.lines.join('\n')).toContain('second');expect(doc.lines.join('\n')).toContain('Nascimento: 2000-01-01');expect(doc.lines.join('\n')).toContain('synthetic-code');
  expect(canonicalDocument({id:14,sha256:'b'.repeat(64),canonical_payload:{}}).lines.join('\n')).toContain('Não informado');
 });
 it('exports the saved meal quantities/nutrients in their original order, including substitutions',()=>{
  const doc=storedClinicalDocument('mealPlanId',[{id:5,patient_id:'synthetic',name:'Plano',description:'Texto',meal_plan_meals:[{order_index:2,name:'Jantar',meal_plan_foods:[{quantity:50,unit:'g',calories:65,protein:1.25,carbs:14,fat:.1,food:{name:'Arroz'},substitutes:[{name:'Opção'}]}]},{order_index:1,name:'Almoço'}]}]);
  expect(doc.lines.indexOf('Almoço ')).toBeLessThan(doc.lines.indexOf('Jantar '));expect(doc.lines.join('\n')).toContain('Arroz: 50 g');expect(doc.lines.join('\n')).toContain('65 kcal');expect(doc.lines.join('\n')).toContain('Opção');
  const simple=storedClinicalDocument('mealPlanId',[{id:5,meal_plan_meals:[{meal_plan_foods:[{quantity:50,food:{name:'Arroz'},calories:65}]}]}],{patientName:'Example',includeNutrients:false});
  expect(simple.lines.join('\n')).toContain('Paciente: Example');expect(simple.lines.join('\n')).not.toContain('65 kcal');
 });
 it('rejects comparisons across patients and preserves saved clinical measurements',()=>{
  expect(()=>storedClinicalDocument('anthropometryRecordId',[{id:1,patient_id:'a'},{id:2,patient_id:'b'}])).toThrow('scope');
  const doc=storedClinicalDocument('anthropometryRecordId',[{id:1,patient_id:'a',weight:70,height:175,results:{lean_mass_kg:50}},{id:2,patient_id:'a',weight:71,height:175}]);
  expect(doc.lines.join('\n')).toContain('Peso: 70 kg');expect(doc.lines.join('\n')).toContain('lean_mass_kg: 50');
  expect(storedClinicalDocument('anamnesisRecordId',[{id:'fake',patient_id:'a',content:{note:'Histórico preservado'}}]).lines.join('\n')).toContain('Histórico preservado');
  expect(()=>storedClinicalDocument('mealPlanId',[])).toThrow();
 });
});
