import {act,renderHook,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useShadowDraft} from './useShadowDraft';
import {clearPrivateDraftStorage} from '@/lib/utils/privateDraftStorage';
import {readMemoryDraft} from '@/lib/utils/memoryDrafts';
const mock=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:mock.from}}));
it('cannot restore an old shadow payload after logout or publish a queued obsolete callback',async()=>{
 mock.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null})};return q;});
 const {result}=renderHook(()=>useShadowDraft({ownerId:'synthetic-a',draftKey:'synthetic-plan'}));await waitFor(()=>expect(result.current.ready).toBe(true));
 const queue=result.current.queue,flush=result.current.flush;const reads=mock.from.mock.calls.length;
 act(()=>clearPrivateDraftStorage());act(()=>queue({name:'Private A'}));await act(async()=>flush());
 expect(readMemoryDraft('nello_shadow:synthetic-a:synthetic-plan')).toBeNull();expect(mock.from).toHaveBeenCalledTimes(reads);
});
