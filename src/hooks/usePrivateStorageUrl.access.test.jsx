import {act,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {usePrivateStorageUrl} from './usePrivateStorageUrl';
import {setPrivateSessionOwner} from '@/lib/utils/privateSessionState';
import {invalidateDomain} from '@/infrastructure/realtime/events';
const state=vi.hoisted(()=>({download:vi.fn(),authChanged:null}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{auth:{onAuthStateChange:fn=>{state.authChanged=fn;return{data:{subscription:{unsubscribe:()=>{}}}};}},storage:{from:()=>({download:state.download})}}}));
afterEach(()=>vi.restoreAllMocks());
it('revokes an existing local private URL and rejects late pre-access download results',async()=>{
 setPrivateSessionOwner('synthetic-a');const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic-private'),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 state.download.mockResolvedValue({data:new Blob(['synthetic'])});
 const {result}=renderHook(()=>usePrivateStorageUrl('storage:chat_media/synthetic-a/photo.webp'));
 await waitFor(()=>expect(result.current).toBe('blob:synthetic-private'));
 state.download.mockReturnValue(new Promise(()=>{}));act(()=>invalidateDomain('synthetic-a','access'));
 expect(result.current).toBeUndefined();expect(revoke).toHaveBeenCalledWith('blob:synthetic-private');expect(create).toHaveBeenCalledOnce();
});
it('does not revoke a private image solely because the same actor receives SIGNED_IN again',async()=>{
 setPrivateSessionOwner('synthetic-a');state.download.mockClear();state.download.mockResolvedValue({data:new Blob(['synthetic'])});
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic-current');const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const {result}=renderHook(()=>usePrivateStorageUrl('storage:chat_media/synthetic-a/second.webp'));
 await waitFor(()=>expect(result.current).toBe('blob:synthetic-current'));
 act(()=>state.authChanged('SIGNED_IN',{user:{id:'synthetic-a'}}));
 expect(result.current).toBe('blob:synthetic-current');expect(revoke).not.toHaveBeenCalled();expect(state.download).toHaveBeenCalledOnce();
});
