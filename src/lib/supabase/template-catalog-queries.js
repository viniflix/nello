import { nutritionClient as supabase } from '@/infrastructure/supabase/domainClients';
import {readRequest} from './readRequest';
import {readPolicies} from '@/lib/utils/readPolicy';

export const TEMPLATE_PAGE_SIZE=20;
const definitions={
 diet:{table:'diet_templates',select:'id,name,description,tags,created_at,updated_at,diet_template_meals(id,diet_template_foods(id))'},
 meal:{table:'meal_templates',select:'id,name,description,tags,created_at,updated_at,meal_template_foods(id)'},
 recipe:{table:'recipes',select:'id,name,description,yield_quantity,yield_unit,base_calories,created_at,updated_at,recipe_ingredients(id)'},
};
const literal=value=>String(value).replace(/[\\%_]/g,'\\$&').replace(/"/g,'\\"');
export async function getTemplateCatalogPage(owner,type,{search='',cursor=null,signal}={}) {
 const def=definitions[type];if(!owner||!def)throw new Error('Invalid template catalogue');
 let query=supabase.from(def.table).select(def.select).eq('user_id',owner);
 if(type==='recipe')query=query.eq('is_deleted',false);
 const text=String(search).trim().slice(0,100);
 if(text)query=query.or(`name.ilike."%${literal(text)}%",description.ilike."%${literal(text)}%"`);
 if(cursor){
  if(!/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(cursor.created_at)||!/^[-\w]+$/.test(String(cursor.id)))throw new Error('Invalid template cursor');
  query=query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
 }
 const {data,error}=await readRequest(()=>query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(TEMPLATE_PAGE_SIZE+1),{signal,policy:readPolicies.clinical});
 if(error)throw error;
 const rows=data||[],items=rows.slice(0,TEMPLATE_PAGE_SIZE).map(t=>({...t,
  ...(type==='diet'?{meal_count:t.diet_template_meals?.length||0,food_count:t.diet_template_meals?.reduce((sum,m)=>sum+(m.diet_template_foods?.length||0),0)||0}
   :{food_count:(type==='meal'?t.meal_template_foods:t.recipe_ingredients)?.length||0}),
 }));
 const last=items.at(-1);
 return {items,nextCursor:rows.length>TEMPLATE_PAGE_SIZE?{created_at:last.created_at,id:last.id}:null};
}
