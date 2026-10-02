import { describe, it, expect } from 'vitest';
import { mapFatSecretToOFF, normalizeExternalProduct } from './externalFood';
describe('external food provenance and dimensional conversion', () => {
  it('normalizes a gram serving and retains missing values as unknown', () => {
    const result = mapFatSecretToOFF({food_name:'Synthetic',servings:{serving:{metric_serving_amount:'50',metric_serving_unit:'g',protein:'0',carbohydrate:'10',calcium:'20',iron:'1',sodium:'50'}}});
    expect(result.nutriments).toEqual({proteins_100g:0,carbohydrates_100g:20,calcium_100g:0.04,iron_100g:0.002,sodium_100g:0.1});
    expect(result.nutriments).not.toHaveProperty('fat_100g');
  });
  it('refuses a volume or missing mass instead of assuming density', () => {
    for (const unit of ['ml','oz',undefined]) expect(()=>mapFatSecretToOFF({servings:{serving:{metric_serving_amount:'100',metric_serving_unit:unit}}})).toThrow();
  });
  it('prefers 100g and never invents a nutrient from null, blanks, invalid or negative values', () => {
    const result=mapFatSecretToOFF({servings:{serving:[{metric_serving_amount:'50',metric_serving_unit:'g',fat:'4'},{metric_serving_amount:'100',metric_serving_unit:'g',fat:'3',protein:null,fiber:'',sugar:'bad',sodium:'-1',vitamin_a:'10'}]}});
    expect(result.nutriments).toEqual({fat_100g:3,vitamin_a_100g:0.00001});
  });
});

it('keeps unknown label values absent and genuine zero intact', () => {
  expect(normalizeExternalProduct({nutriments:{proteins_100g:null, fat_100g:'', fiber_100g:0, sodium_100g:-1}}).nutriments).toEqual({fiber_100g:0});
});
it('converts only explicit gram servings and prefers supplied mass values', () => {
  expect(normalizeExternalProduct({serving_size:'50 g',nutriments:{proteins_serving:5, fat_100g:4, fat_serving:3}}).nutriments).toEqual({proteins_100g:10,fat_100g:4});
  expect(normalizeExternalProduct({serving_size:50,nutriments:{proteins_serving:5}}).nutriments).toEqual({});
  expect(() => normalizeExternalProduct({nutrition_data_per:'100ml'})).toThrow('peso em gramas');
});
