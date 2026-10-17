import {describe,it,expect} from 'vitest';
import {validateAnamnesisTemplate} from './formContracts';
const field=(id,dependency)=>({id,label:id,type:'text',...(dependency?{conditional_logic:{field_id:dependency,operator:'equals',value:'yes'}}:{})});
const template=fields=>({title:'Synthetic',sections:[{id:'s',title:'Synthetic',fields}]});
describe('anamnesis conditional graph',()=>{
 it.each([[field('a','b'),field('b','a')],[field('a','b'),field('b','c'),field('c','a')]])('rejects a dependency cycle',(...fields)=>expect(validateAnamnesisTemplate(template(fields))).toMatch(/ciclo/i));
 it('accepts a valid chain across sections',()=>expect(validateAnamnesisTemplate({title:'Synthetic',sections:[{title:'One',fields:[field('a')]},{title:'Two',fields:[field('b','a'),field('c','b')]}]})).toBeNull());
 it('rejects self references and missing dependencies',()=>{expect(validateAnamnesisTemplate(template([field('a','a')]))).toMatch(/condi/i);expect(validateAnamnesisTemplate(template([field('a','missing')]))).toMatch(/condi/i);});
 it('rejects an unsupported condition operator',()=>expect(validateAnamnesisTemplate(template([{...field('a','b'),conditional_logic:{field_id:'b',operator:'unknown',value:'x'}},field('b')]))).toMatch(/condi/i));
});
