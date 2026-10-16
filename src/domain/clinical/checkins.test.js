import {describe,expect,it} from 'vitest';import {calculateExplicitCheckinScore as score,normalizeCheckinScore} from './checkins';
const f=(id,type,mode,weight=1)=>({id,field_type:type,scoring_rule:{version:2,mode},score_weight:weight});
describe('explicit check-in scoring oracle',()=>{
 it('a positive yes/no criterion and a symptom with desired no are explicit',()=>{expect(score([f('positive','yes_no','yes'),f('symptom','yes_no','no')],{positive:'yes',symptom:'no'}).percentage).toBe(100);expect(score([f('symptom','yes_no','no')],{symptom:'yes'}).percentage).toBe(0);});
 it('does not infer adherence from descriptive answers or missing criteria',()=>{expect(score([f('text','text','none'),f('number','number','none'),{id:'legacy',field_type:'yes_no',score_weight:10}],{text:'Synthetic',number:0,legacy:'yes'})).toEqual({total:0,maximum:0,percentage:null});});
 it('excludes absent optional items and zero weights',()=>{expect(score([f('yes','yes_no','yes'),f('optional','yes_no','yes'),f('zero','yes_no','yes',0)],{yes:'yes',zero:'no'})).toEqual({total:10,maximum:10,percentage:100});});
 it.each([[1,'higher_better',0],[10,'higher_better',100],[1,'lower_better',100],[10,'lower_better',0],[5,'higher_better',400/9]])('normalizes scale %s / %s', (value,mode,expected)=>{expect(score([f('scale','scale_1_10',mode)],{scale:[value]}).percentage).toBeCloseTo(expected,10);});
 it('uses the configured weights',()=>{expect(score([f('a','yes_no','yes',3),f('b','yes_no','yes',1)],{a:'yes',b:'no'}).percentage).toBe(75);});
 it.each([null,undefined,false,true,'',' ',NaN,Infinity,-1,101,{},[]])('represents invalid score %s as absent',value=>expect(normalizeCheckinScore(value)).toBeNull());
 it.each([0,80,'0','80.5'])('preserves valid score %s',value=>expect(normalizeCheckinScore(value)).toBe(Number(value)));
});
