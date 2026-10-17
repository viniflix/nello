import {it,expect} from 'vitest';
import {isFieldVisible} from './conditionalLogic';
const field=(id,parent)=>({id,...(parent?{conditional_logic:{field_id:parent,operator:'equals',value:'yes'}}:{})});
it('hides a child whose parent is hidden even when a stale parent answer remains',()=>{const a=field('a'),b=field('b','a'),c=field('c','b'),sections=[{fields:[a,b,c]}];expect(isFieldVisible(c,{a:'no',b:'yes'},sections)).toBe(false);expect(isFieldVisible(c,{a:'yes',b:'yes'},sections)).toBe(true);});
it('does not loop over a malformed cyclic legacy snapshot',()=>{const a=field('a','b'),b=field('b','a');expect(isFieldVisible(a,{a:'yes',b:'yes'},[{fields:[a,b]}])).toBe(false);});
