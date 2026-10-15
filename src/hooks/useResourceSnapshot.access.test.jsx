import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useResourceSnapshot } from './useResourceSnapshot';
import { invalidateDomain } from '@/infrastructure/realtime/events';
it('invalidates a manual snapshot and late confirmation on an access event without affecting another actor',()=>{
 const {result}=renderHook(()=>useResourceSnapshot(JSON.stringify(['synthetic-a','records']),[]));let ticket;
 act(()=>{ticket=result.current.begin();result.current.succeed(ticket,['private']);});
 act(()=>invalidateDomain('synthetic-b','access'));expect(result.current.hasSnapshot).toBe(true);
 act(()=>invalidateDomain('synthetic-a','access'));expect(result.current.hasSnapshot).toBe(false);
 expect(result.current.succeed(ticket,['late-private'])).toBe(false);
});
