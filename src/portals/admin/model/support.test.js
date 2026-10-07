import{describe,it,expect}from'vitest';
import{validateSupportSource}from'./support';
describe('support source contracts',()=>{
 const queue=()=>({schema_version:1,can_write:false,generated_at:new Date().toISOString(),items:[],total:0,metrics:{open:0,unknown_sends:0,first_reply_sample:0,first_reply_p50_hours:null}});
 it('distinguishes a verified empty queue from a malformed source',()=>{expect(validateSupportSource(queue(),'queue').items).toEqual([]);for(const data of [null,{}, {...queue(),items:null},{...queue(),can_write:'true'}])expect(()=>validateSupportSource(data,'queue')).toThrow('source_invalid');});
 it('rejects invented or negative response metrics',()=>{for(const value of [-1,NaN,Infinity,'5'])expect(()=>validateSupportSource({...queue(),metrics:{...queue().metrics,first_reply_p50_hours:value}},'queue')).toThrow();});
 it('rejects unsupported case and attachment shapes',()=>{expect(()=>validateSupportSource({...queue(),item:{id:'unknown'},messages:[],events:[],has_more:false},'case')).toThrow();expect(()=>validateSupportSource(queue(),'unknown')).toThrow();});
});
