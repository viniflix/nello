import {beforeEach,expect,it,vi} from 'vitest';
import {getPatientHomeMeals} from './patient-home-queries';
import {getTemplateCatalogPage} from './template-catalog-queries';
import {fetchAppointmentsInPeriod} from './agenda-list-queries';
const state=vi.hoisted(()=>({rows:[],calls:[],remove:false,insert:false}));
vi.mock('@/infrastructure/supabase/domainClients',async()=>{
 const {createClient}=await import('@supabase/supabase-js');
 const client=createClient('http://synthetic.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input)=>{
  const url=new URL(String(input));state.calls.push({table:url.pathname.split('/').at(-1),query:url.searchParams.toString()});
  let rows=state.rows;
  const gt=url.searchParams.get('id');if(gt?.startsWith('gt.'))rows=rows.filter(x=>x.id>gt.slice(3));
  for(const or of url.searchParams.getAll('or')){
   const cursor=or.match(/id.lt.([-\w]+)/);if(cursor)rows=rows.filter(x=>x.id<cursor[1]);
   else if(or.includes('name.ilike'))rows=rows.filter(x=>x.name.includes('needle'));
  }
  if(url.pathname.endsWith('/diet_templates'))rows=[...rows].sort((a,b)=>b.id.localeCompare(a.id));
  const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);rows=rows.slice(offset,offset+limit);
  const count=state.rows.length;return new Response(JSON.stringify(rows),{headers:{'content-type':'application/json','content-range':`0-${rows.length-1}/${count}`}});
 }}});return {patientClient:client,nutritionClient:client,agendaClient:client};
});
beforeEach(()=>{state.calls=[];state.rows=[];});
const rows=n=>Array.from({length:n},(_,i)=>({id:String(i+1).padStart(8,'0'),created_at:'2026-01-01T00:00:00Z',name:i===0?'needle':'row',total_calories:2,total_protein:1,diet_template_meals:[{id:'meal',diet_template_foods:[{id:'food'}]}]}));
it.each([0,20,250,1000,10000])('retains all %i Home rows and exact nutrition/count within the cap',async n=>{
 state.rows=rows(n);const result=await getPatientHomeMeals('actor','2026-01-01');expect(result.error).toBeNull();expect(result.data).toHaveLength(n);expect(result.count).toBe(n);expect(result.data.reduce((sum,x)=>sum+x.total_calories,0)).toBe(n*2);expect(state.calls.length).toBe(Math.max(1,Math.ceil(n/250)));
});
it.each([0,20,250,1000,10000])('catalogue %i rows has bounded first page and accessible later items',async n=>{
 state.rows=rows(n);const page=await getTemplateCatalogPage('owner','diet');expect(page.items).toHaveLength(Math.min(n,20));expect(Boolean(page.nextCursor)).toBe(n>20);expect(state.calls).toHaveLength(1);
 if(n){expect(page.items[0].food_count).toBe(1);const found=await getTemplateCatalogPage('owner','diet',{search:'needle'});expect(found.items).toHaveLength(1);}
});
it('keyset pages do not duplicate/skip surviving rows after insertion/deletion before cursor',async()=>{
 state.rows=rows(45);const first=await getTemplateCatalogPage('owner','diet');const removed=first.items[0].id;
 state.rows=state.rows.filter(x=>x.id!==removed);state.rows.push({...rows(1)[0],id:'99999999'});
 const second=await getTemplateCatalogPage('owner','diet',{cursor:first.nextCursor});expect(new Set([...first.items,...second.items].map(x=>x.id)).size).toBe(40);expect(second.items.map(x=>x.id)).toEqual(rows(45).map(x=>x.id).reverse().slice(20,40));
});
it('Home over cap fails rather than publishing a truncated clinical total',async()=>{state.rows=rows(10001);const result=await getPatientHomeMeals('actor','2026-01-01');expect(result.data).toBeNull();expect(result.error.message).toBe('REPORT_ROW_LIMIT_REACHED');});
it.each([0,20,250,1000,10000])('Agenda %i rows preserves its full bounded report',async n=>{state.rows=rows(n);const data=await fetchAppointmentsInPeriod('owner',new Date('2026-01-01'),new Date('2026-02-01'));expect(data).toHaveLength(n);expect(state.calls.length).toBe(Math.floor(n/500)+1);});
