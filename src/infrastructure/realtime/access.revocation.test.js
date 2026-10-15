import { afterEach, expect, it, vi } from 'vitest';
import { invalidateDomain, subscribeDomain } from './events';
afterEach(()=>vi.useRealTimers());
it('delivers access loss synchronously while ordinary data updates remain coalesced',()=>{
 vi.useFakeTimers();const access=vi.fn(),clinical=vi.fn();const a=subscribeDomain('synthetic-a','access',access),c=subscribeDomain('synthetic-a','clinical',clinical);
 invalidateDomain('synthetic-a','clinical');invalidateDomain('synthetic-a','access');
 expect(access).toHaveBeenCalledOnce();expect(clinical).not.toHaveBeenCalled();vi.advanceTimersByTime(100);expect(clinical).toHaveBeenCalledOnce();a();c();
});
