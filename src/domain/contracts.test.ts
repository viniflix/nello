import { describe, expect, it, vi } from 'vitest';
import { executeOperation, toRpcRequest } from './api';
import { civilDate, parseContract } from './contracts';
import { actorSchema, normalizeAuthEmail } from './identity';
import { patientContextSchema } from './patient';
import { appointmentSchema } from './agenda';
import { clinicalOperationSchema, isConfirmedAnamnesis } from './clinical';
import { foodPortionSchema, calculateNutrition, foodPer100Grams, normalizeMealTime } from './nutrition';
import { decimalMoney, netAfterFee } from './finance';
import { validateUploadSelection } from './files';
import { messageIntentSchema } from './communication';
import { acceptSyncReceipt, syncPolicy } from './sync';

const actor = '10000000-0000-4000-8000-000000000001';
const nonce = '10000000-0000-4000-8000-000000000002';
const operations = [
  {version:1,operation:'record.insert',args:{p_table:'meal_plans',p_values:{name:'Plano sintético'},p_id:null,p_expected:null}},
  {version:1,operation:'record.update',args:{p_table:'meal_plans',p_values:{name:'Plano sintético'},p_id:'1',p_expected:'revision'}},
  {version:1,operation:'clinical.perform',args:{p_operation:'meal_plan',p_arguments:{p_plan_data:{patient_id:actor}},p_expected:null}},
  {version:1,operation:'nutrition.meal.save',args:{p_plan_id:1,p_meal_id:null,p_meal:{meal_time:'08:00',foods:[]},p_expected:null}},
];
describe('shared web / simulated native contracts', () => {
  it.each(operations)('keeps the existing server payload for $operation', async operation => {
    const calls: unknown[] = [];
    const transport = async (rpc: string,args: Record<string,unknown>) => { calls.push({rpc,args});return {data:{id:1},error:null}; };
    expect(await executeOperation(transport,structuredClone(operation))).toEqual(await executeOperation(transport,JSON.parse(JSON.stringify(operation))));
    expect(calls[0]).toEqual(calls[1]);
    expect(toRpcRequest(operation).args).toEqual(operation.args);
    expect(toRpcRequest(operation).args).not.toHaveProperty('version');
  });
  it.each(['42501','PT409','NETWORK_FAILURE'])('preserves server errors unchanged (%s)', async code => {
    const result = {data:null,error:{code,message:'synthetic'}};
    expect(await executeOperation(async()=>result,operations[0])).toBe(result);
  });
  it.each([
    {version:2,operation:'record.insert',args:{}},
    {version:1,operation:'delete_everything',args:{}},
    {version:1,operation:'record.insert',args:{p_table:'foods',p_values:[],p_id:null}},
    {...operations[0],secret:'sensitive text'},
    {version:1,operation:'record.update',args:{p_table:'foods',p_values:{},p_id:null}},
  ])('rejects incompatible / malformed contracts before transport', async operation => {
    const transport = vi.fn();
    await expect(executeOperation(transport,operation)).rejects.toMatchObject({code:'INVALID_CONTRACT',message:'Contrato de operação inválido.'});
    expect(transport).not.toHaveBeenCalled();
  });
  it('reuses exact nutrition, time and finance rules in a second consumer', () => {
    const food={source:'custom',portion_size:50,protein:6,carbs:25,fat:2};
    const fromWeb=calculateNutrition(foodPer100Grams(food),100);
    const fromNative=calculateNutrition(foodPer100Grams(JSON.parse(JSON.stringify(food))),100);
    expect(fromWeb).toEqual(fromNative);
    expect(fromWeb).toMatchObject({calories:284,protein:12,carbs:50,fat:4});
    expect(calculateNutrition({source:'TACO',calories:300,protein:8,carbs:58,fat:3},100).calories).toBe(300);
    expect(normalizeMealTime('08:30:00')).toBe('08:30');
    expect(normalizeMealTime('')).toBeNull();
    expect(()=>normalizeMealTime('25:00')).toThrow();
    expect(decimalMoney('1,005')).toBe('1.01');
    expect(netAfterFee('100','2.5')).toBe(97.5);
  });
  it('validates the eight domain boundaries without trusting client permissions', () => {
    expect(actorSchema.parse({id:actor,role:'nutritionist'}).id).toBe(actor);
    expect(normalizeAuthEmail(' A@EXAMPLE.INVALID ')).toBe('a@example.invalid');
    expect(normalizeAuthEmail(null)).toBe('');
    expect(patientContextSchema.safeParse({patientId:actor,episodeId:null,revision:0}).success).toBe(true);
    expect(clinicalOperationSchema.safeParse({recordId:1,expectedRevision:0,visibility:'professional_private'}).success).toBe(true);
    expect(appointmentSchema.safeParse({patientId:actor,date:'2026-10-04',time:'09:00',durationMinutes:30}).success).toBe(true);
    expect(foodPortionSchema.safeParse({foodId:1,quantity:0,gramsEquivalent:50,unit:'g'}).success).toBe(true);
    expect(foodPortionSchema.safeParse({foodId:1,quantity:Infinity,gramsEquivalent:50,unit:'g'}).success).toBe(false);
    expect(()=>validateUploadSelection('chat_media',{size:1,type:'text/html'})).toThrow();
    expect(messageIntentSchema.safeParse({conversationId:1,nonce,kind:'text'}).success).toBe(true);
    expect(isConfirmedAnamnesis('completed')).toBe(false);
    expect(isConfirmedAnamnesis('submitted')).toBe(true);
    expect(()=>parseContract(civilDate,'2026-02-30')).toThrow();
  });
  it('requires account and revision agreement without offline replay or payload storage', () => {
    const receipt={version:1,actorId:actor,domain:'nutrition',entityId:1,revision:4,nonce,outcome:'confirmed'};
    expect(acceptSyncReceipt(receipt,actor,4)).toMatchObject({revision:4});
    expect(()=>acceptSyncReceipt(receipt,nonce,4)).toThrow('SESSION_CHANGED');
    expect(()=>acceptSyncReceipt(receipt,actor,5)).toThrow('STALE_REVISION');
    expect(()=>acceptSyncReceipt(receipt,actor,NaN)).toThrow();
    expect(()=>acceptSyncReceipt({...receipt,clinicalPayload:'private'},actor,4)).toThrow();
    expect(syncPolicy).toMatchObject({clinicalOfflineStorage:false,automaticReplay:false});
  });
});
