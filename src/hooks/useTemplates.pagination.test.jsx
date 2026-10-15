import React from 'react';import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {renderHook,waitFor,act,cleanup} from '@testing-library/react';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useTemplates} from './useTemplates';
const state=vi.hoisted(()=>({rows:[],calls:[],user:{id:'owner'},error:false}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:state.user})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:table=>builder(table)}}));
vi.mock('@/infrastructure/supabase/domainClients',()=>({nutritionClient:{from:table=>builder(table)}}));
function builder(table){const f={table,filters:[],or:[],limit:null};const q={select:s=>{f.select=s;return q},eq:(k,v)=>{f.filters.push([k,v]);return q},order:()=>q,or:x=>{f.or.push(x);return q},limit:n=>{f.limit=n;return q},abortSignal:()=>q,retry:()=>q,then:(resolve,reject)=>{
 state.calls.push(f);let rows=state.rows;
 for(const filter of f.or){const cursor=filter.match(/id.lt.([-\w]+)/);if(cursor)rows=rows.filter(x=>x.id<cursor[1]);else if(filter.includes('name.ilike')){const text=filter.match(/%([^%]*)%/)[1];rows=rows.filter(x=>x.name.includes(text));}}
 return Promise.resolve(state.error?{data:null,error:{status:503}}:{data:rows.slice(0,f.limit||1000),error:null}).then(resolve,reject);
}};return q;}
let client;const wrapper=({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});state.calls=[];state.user={id:'owner'};state.error=false;state.rows=Array.from({length:1000},(_,i)=>({id:String(10000-i).padStart(8,'0'),created_at:'2026-01-01T00:00:00Z',name:`Template ${i}`,diet_template_meals:[{id:'meal',diet_template_foods:[{id:'food'}]}]}));});
afterEach(()=>{cleanup();client.clear()});
it('starts with a bounded server page and exact counts, exposes the remaining catalogue',async()=>{const h=renderHook(()=>useTemplates('diet'),{wrapper});await waitFor(()=>expect(h.result.current.loading).toBe(false));expect(h.result.current.templates).toHaveLength(20);expect(h.result.current.hasMore).toBe(true);expect(state.calls[0].limit).toBe(21);expect(h.result.current.templates[0].food_count).toBe(1);await act(()=>h.result.current.loadMore());await waitFor(()=>expect(h.result.current.templates).toHaveLength(40));expect(new Set(h.result.current.templates.map(x=>x.id)).size).toBe(40);});
it('searches the server catalogue beyond loaded pages and resets the cursor',async()=>{const h=renderHook(({search})=>useTemplates('diet',{search}),{wrapper,initialProps:{search:''}});await waitFor(()=>expect(h.result.current.loading).toBe(false));h.rerender({search:'Template 999'});await waitFor(()=>expect(h.result.current.templates.map(x=>x.name)).toEqual(['Template 999']));expect(h.result.current.hasMore).toBe(false);});
