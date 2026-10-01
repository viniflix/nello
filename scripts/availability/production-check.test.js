// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {checkProduction} from './production-check.mjs';
it('records a real contract failure and delivers a grouped event without raw errors or credentials',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true});
 const result=await checkProduction({smoke:async()=>{throw Error('clinical secret and credentials');},fetcher,env:{SENTRY_DSN:'https://public-key@example.invalid/1'}});
 expect(result).toMatchObject({passed:false,alertDelivered:true});
 expect(fetcher.mock.calls[0][1].body).not.toContain('clinical secret');
 expect(fetcher.mock.calls[0][0].username).toBe('');
 expect(fetcher.mock.calls[0][1].body).toContain('production-availability-contract');
});
it('does not generate incidents when health and assets pass',async()=>{
 const fetcher=vi.fn();expect(await checkProduction({smoke:async()=>{},fetcher})).toMatchObject({passed:true});expect(fetcher).not.toHaveBeenCalled();
});
