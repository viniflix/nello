import {setTimeout as delay} from 'node:timers/promises';
export async function observeDeployment(base,{smoke,durationMs=0,intervalMs=60_000,now=Date.now,sleep=delay,record=()=>{}}){
 if(typeof smoke!=='function'||!Number.isFinite(durationMs)||durationMs<0||!Number.isFinite(intervalMs)||intervalMs<1||intervalMs>60_000)throw Error('Invalid observation policy');
 const started=now();let checks=0;
 do{await smoke(base,{stage:'observation'});checks++;record({stage:'observation-check',elapsedMs:now()-started,checks});if(now()-started>=durationMs)break;await sleep(Math.min(intervalMs,durationMs-(now()-started)));}while(true);
 return {passed:true,durationMs:now()-started,checks};
}
