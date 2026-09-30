import {it,expect,vi} from 'vitest';
import {observeDeployment} from './observation.mjs';
it('checks the entire policy window with bounded waits',async()=>{
 let time=0;const waits=[];const smoke=vi.fn().mockResolvedValue({passed:true});
 const result=await observeDeployment('https://synthetic.invalid',{smoke,durationMs:1800000,now:()=>time,sleep:async ms=>{waits.push(ms);time+=ms;}});
 expect(result).toEqual({passed:true,durationMs:1800000,checks:31});expect(Math.max(...waits)).toBe(60000);expect(smoke).toHaveBeenCalledTimes(31);
});
it('stops immediately when a later observation detects a regression',async()=>{
 let time=0;const smoke=vi.fn().mockResolvedValueOnce({passed:true}).mockRejectedValueOnce(Error('broken asset'));
 await expect(observeDeployment('https://synthetic.invalid',{smoke,durationMs:120000,now:()=>time,sleep:async ms=>{time+=ms;}})).rejects.toThrow('broken asset');expect(time).toBe(60000);
});
