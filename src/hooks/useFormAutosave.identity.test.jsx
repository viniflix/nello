import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useFormAutosave } from './useFormAutosave';
import { clearPrivateDraftStorage } from '@/lib/utils/privateDraftStorage';
import { readMemoryDraft } from '@/lib/utils/memoryDrafts';
it('does not let an old editor callback recreate private drafts or save after identity loss',async()=>{
 const save=vi.fn();const {result}=renderHook(()=>useFormAutosave({storageKey:'synthetic:a:form',enabled:true,save,serverValue:{},delay:10000}));
 const queue=result.current.queue,flush=result.current.flush;
 act(()=>clearPrivateDraftStorage());act(()=>queue({answer:'old-private'}));
 expect(readMemoryDraft('synthetic:a:form')).toBeNull();await act(async()=>flush());expect(save).not.toHaveBeenCalled();
});
