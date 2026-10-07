import {describe,it,expect} from 'vitest';
import {capacityComparison,sampleQualification,signalState,civilDate,fortalezaDay} from './intelligence';
describe('intelligence mathematical and temporal contracts',()=>{
 it('distinguishes missing capacity, actual zero, zero limits and excess without a fabricated forecast',()=>{
  expect(capacityComparison({used:0,limit:null}).percentage).toBeNull();
  expect(capacityComparison({used:0,limit:100}).percentage).toBe(0);
  expect(capacityComparison({used:10,limit:0})).toMatchObject({percentage:null,remaining:-10});
  expect(capacityComparison({used:125,limit:100})).toMatchObject({percentage:125,remaining:-25});
  expect(()=>capacityComparison({used:-1,limit:100})).toThrow();
 });
 it('qualifies small and empty populations without dividing by zero or implying causality',()=>{
  expect(sampleQualification(0,0)).toMatchObject({qualified:true,ratio:'Sem população com janela completa'});
  expect(sampleQualification(4,10)).toMatchObject({qualified:true,ratio:'4/10'});
  expect(sampleQualification(10,20).qualified).toBe(false);expect(()=>sampleQualification(2,1)).toThrow();
 });
 it('does not interpret a stale internal condition as absent and expires silence independently',()=>{
  const now=Date.now(),signal={active:true,evaluated_at:new Date(now).toISOString(),muted_until:new Date(now+1000).toISOString()};
  expect(signalState(signal,now).state).toBe('muted');expect(signalState(signal,now+2000).state).toBe('active');
  expect(signalState({...signal,active:false,evaluated_at:new Date(now-600000).toISOString()},now).state).toBe('unknown');
 });
 it('preserves civil dates and the Fortaleza day around midnight UTC',()=>{
  expect(civilDate('2026-10-07')).toBe('07/10/2026');expect(fortalezaDay(new Date('2026-10-07T01:00:00Z'))).toBe('2026-10-06');
 });
});
