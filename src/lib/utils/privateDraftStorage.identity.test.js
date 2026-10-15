import {expect,it} from 'vitest';
import {clearPrivateDraftStorage} from './privateDraftStorage';
it('removes a pending invite intent on identity loss without clearing unrelated preferences',()=>{
 localStorage.setItem('pending_invite_code','synthetic-invite');localStorage.setItem('theme','dark');
 clearPrivateDraftStorage();expect(localStorage.getItem('pending_invite_code')).toBeNull();expect(localStorage.getItem('theme')).toBe('dark');
});
