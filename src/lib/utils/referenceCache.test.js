import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/app/config/queryClient';
import { readReference, invalidateReference, referenceKey } from './referenceCache';
import { invalidatePrivateSession, setPrivateSessionOwner } from './privateSessionState';
import { advanceAccessEpoch } from '@/infrastructure/realtime/accessEpochState';

beforeEach(() => { queryClient.clear(); setPrivateSessionOwner('actor-a'); });
afterEach(() => { queryClient.clear(); setPrivateSessionOwner(null); });

it('isolates source, projection, owner and food even when names match', async () => {
  const load = vi.fn(async () => [{ id: 1 }]);
  await readReference('customActive', 'actor-a', null, load);
  await readReference('customAll', 'actor-a', null, load);
  await readReference('food', 'actor-a', 'food-a', load);
  await readReference('foodLegacy', 'actor-a', 'food-a', load);
  await readReference('food', 'actor-a', 'food-b', load);
  setPrivateSessionOwner('actor-b');
  await readReference('food', 'actor-b', 'food-a', load);
  expect(load).toHaveBeenCalledTimes(6);
  expect(new Set(queryClient.getQueryCache().getAll().map(q => q.queryHash)).size).toBe(6);
});

it('does not cache failed Results or convert errors into confirmed empty lists', async () => {
  const error = { status: 503 };
  const load = vi.fn().mockResolvedValueOnce({data:[], error}).mockResolvedValue({data:[], error:null});
  await expect(readReference('customActive','actor-a',null,load)).rejects.toBe(error);
  expect(queryClient.getQueryData(referenceKey('customActive','actor-a'))).toBeUndefined();
  await expect(readReference('customActive','actor-a',null,load)).resolves.toEqual([]);
  await readReference('customActive','actor-a',null,load);
  expect(load).toHaveBeenCalledTimes(2);
});

it('a caller abort does not cancel another waiter or store caller AbortError', async () => {
  let finish;
  const load = vi.fn(() => new Promise(resolve => {finish=resolve;}));
  const controller = new AbortController();
  const first = readReference('food','actor-a','food-a',load,{signal:controller.signal});
  const second = readReference('food','actor-a','food-a',load);
  controller.abort(); await expect(first).rejects.toMatchObject({name:'AbortError'});
  finish([{grams:40}]); await expect(second).resolves.toEqual([{grams:40}]);
  expect(load).toHaveBeenCalledTimes(1);
});

it.each(['session', 'access'])('removes private snapshots and rejects old flights after %s changes', async kind => {
  await readReference('household',null,null,async()=>[{code:'g'}]);
  await readReference('customActive','actor-a',null,async()=>[{code:'private-a'}]);
  let finish;
  const pending = readReference('food','actor-a','food-a',()=>new Promise(resolve=>{finish=resolve;}));
  const rejection = pending.catch(error=>error);
  if (kind==='session') invalidatePrivateSession(); else advanceAccessEpoch('actor-a');
  finish([{grams:999}]); await rejection;
  expect(queryClient.getQueryCache().getAll().filter(q=>q.queryKey[1]==='private')).toHaveLength(0);
  expect(queryClient.getQueryData(referenceKey('household'))).toEqual([{code:'g'}]);
});

it('invalidates only the requested food/source; an older response cannot restore it', async () => {
  await readReference('food','actor-a','food-other',async()=>[{grams:20}]);
  await readReference('foodLegacy','actor-a','food-a',async()=>[{grams:30}]);
  let finish;
  const flight = readReference('food','actor-a','food-a',()=>new Promise(resolve=>{finish=resolve;}));
  const rejection = flight.catch(error=>error);
  await invalidateReference('food','actor-a',{id:'food-a',source:'food_measures'});
  finish([{grams:999}]); await rejection;
  expect(queryClient.getQueryData(referenceKey('food','actor-a','food-a'))).toBeUndefined();
  expect(queryClient.getQueryData(referenceKey('food','actor-a','food-other'))).toEqual([{grams:20}]);
  expect(queryClient.getQueryData(referenceKey('foodLegacy','actor-a','food-a'))).toEqual([{grams:30}]);
});

it('never reuses a previously fresh private value after a forbidden refresh', async () => {
  await readReference('clinic','actor-a',null,async()=>({goal:10}));
  const error={status:403};
  await expect(readReference('clinic','actor-a',null,async()=>{throw error;},{force:true})).rejects.toBe(error);
  expect(queryClient.getQueryData(referenceKey('clinic','actor-a'))).toBeUndefined();
  const recover=vi.fn(async()=>({goal:20}));
  await expect(readReference('clinic','actor-a',null,recover)).resolves.toEqual({goal:20});
  expect(recover).toHaveBeenCalledTimes(1);
});
