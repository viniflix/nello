// @vitest-environment node
import { load } from 'js-yaml';
import { it,expect } from 'vitest';
it('counts empty merge sources against the configured budget while accepting ordinary configuration',()=>{
 expect(()=>load('arr: &arr [{}, {}, {}]\ntarget:\n  <<: *arr\n',{maxTotalMergeKeys:2})).toThrow(/merge/i);
 expect(load('base: &base {enabled: true}\nconfig: {<<: *base, name: nello}',{maxTotalMergeKeys:20}).config).toEqual({enabled:true,name:'nello'});
});
