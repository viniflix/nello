import {act,fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import NutritionistFoodsPage from './NutritionistFoodsPage';
const fake=vi.hoisted(()=>({search:vi.fn(),toast:vi.fn(),observers:[]}));
vi.mock('@/lib/supabase/foodService',()=>({searchFoodsPaginated:fake.search,getFoodMeasures:vi.fn()}));
vi.mock('@/hooks/useDebounce',()=>({useDebounce:value=>value}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:fake.toast})}));
vi.mock('@/components/nutritionist/FoodMeasureManager',()=>({default:()=>null}));
vi.mock('@/components/nutrition/SmartFoodForm',()=>({default:()=>null}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:vi.fn().mockReturnThis(),then:resolve=>resolve({count:0,error:null})})})}}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const row=(id,name)=>({id,name,calories:1,protein:1,carbs:1,fat:1});
const input=()=>screen.getByPlaceholderText(/Buscar alimento/);
beforeEach(()=>{fake.search.mockReset();fake.toast.mockClear();fake.observers=[];vi.stubGlobal('IntersectionObserver',class{constructor(callback){this.callback=callback;fake.observers.push(this);}observe(){}unobserve(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('exposes a persistent accessible name for food search without relying on its placeholder',async()=>{
 await act(async()=>render(<NutritionistFoodsPage/>));
 expect(screen.getByRole('textbox',{name:'Buscar alimentos'})).toBe(input());
});
it.each(['create','edit'])('restores keyboard focus to the %s dialog trigger when it closes',async(mode)=>{
 fake.search.mockResolvedValue({data:[row('focus-food','Alimento sintético')],hasMore:false});
 await act(async()=>render(<NutritionistFoodsPage/>));
 if(mode==='edit'){fireEvent.change(input(),{target:{value:'Alimento sintético'}});await screen.findByText('Alimento sintético');}
 const trigger=screen.getByRole('button',{name:mode==='edit'?'Editar':'Novo Alimento'});trigger.focus();fireEvent.click(trigger);
 const dialog=await screen.findByRole('dialog',{name:mode==='edit'?'Editar Alimento':'Novo Alimento'});
 fireEvent.keyDown(dialog,{key:'Escape',code:'Escape'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await waitFor(()=>expect(trigger).toHaveFocus());
});
it('keeps keyboard pagination focus during loading and moves it to retry on append failure',async()=>{
 const append=deferred();fake.search.mockResolvedValueOnce({data:[row('focus-last','Último resultado')],hasMore:true}).mockReturnValueOnce(append.promise);
 await act(async()=>render(<NutritionistFoodsPage/>));fireEvent.change(input(),{target:{value:'Busca por teclado'}});await screen.findByText('Último resultado');const more=screen.getByRole('button',{name:'Carregar mais'});more.focus();fireEvent.click(more);
 expect(more).toBeInTheDocument();expect(more).toHaveFocus();
 await act(async()=>append.reject(Object.assign(new Error('network unavailable'),{status:503})));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Tentar novamente'})).toHaveFocus());expect(screen.getByText('Último resultado')).toBeTruthy();
 fake.search.mockRejectedValueOnce(Object.assign(new Error('network unavailable again'),{status:503}));fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Tentar novamente'})).toHaveFocus());
 fake.search.mockResolvedValueOnce({data:[row('recovered-focus','Resultado recuperado')],hasMore:false});fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await screen.findByText('Resultado recuperado');
 expect(screen.getAllByRole('button',{name:'Editar'})[0]).toHaveFocus();
});
it('returns keyboard pagination to the prior visible result after a successful final append',async()=>{
 const append=deferred();fake.search.mockResolvedValueOnce({data:[row('old-focus','Resultado anterior')],hasMore:true}).mockReturnValueOnce(append.promise);
 await act(async()=>render(<NutritionistFoodsPage/>));fireEvent.change(input(),{target:{value:'Busca por teclado'}});await screen.findByText('Resultado anterior');const oldEdit=screen.getByRole('button',{name:'Editar'});const more=screen.getByRole('button',{name:'Carregar mais'});more.focus();fireEvent.click(more);
 await act(async()=>append.resolve({data:[row('new-focus','Resultado novo')],hasMore:false}));await screen.findByText('Resultado novo');expect(oldEdit).toHaveFocus();
});
it('does not steal search focus when background append fails after the user moved away',async()=>{
 const append=deferred();fake.search.mockResolvedValueOnce({data:[row('last-focus','Resultado retido')],hasMore:true}).mockReturnValueOnce(append.promise);
 await act(async()=>render(<NutritionistFoodsPage/>));fireEvent.change(input(),{target:{value:'Busca por teclado'}});await screen.findByText('Resultado retido');const more=screen.getByRole('button',{name:'Carregar mais'});more.focus();fireEvent.click(more);input().focus();
 await act(async()=>append.reject(Object.assign(new Error('network unavailable'),{status:503})));await screen.findByRole('alert');expect(input()).toHaveFocus();
});
it('does not publish older search after the current search succeeds',async()=>{
 const old=deferred();fake.search.mockReturnValueOnce(old.promise).mockResolvedValue({data:[row('b','Atual B')],hasMore:false});render(<NutritionistFoodsPage/>);
 fireEvent.change(input(),{target:{value:'Antigo A'}});await waitFor(()=>expect(fake.search).toHaveBeenCalledTimes(1));
 fireEvent.change(input(),{target:{value:'Atual B'}});await screen.findByText('Atual B');
 await act(async()=>old.resolve({data:[row('a','Antigo A')],hasMore:false}));expect(screen.queryByText('Antigo A')).toBeNull();expect(screen.getByText('Atual B')).toBeTruthy();
});
it('ignores a pending search after the term is cleared and aborts its signal',async()=>{
 const old=deferred();fake.search.mockReturnValue(old.promise);render(<NutritionistFoodsPage/>);fireEvent.change(input(),{target:{value:'Antigo A'}});await waitFor(()=>expect(fake.search).toHaveBeenCalledTimes(1));
 const options=fake.search.mock.calls[0][3];fireEvent.change(input(),{target:{value:''}});await act(async()=>old.resolve({data:[row('a','Antigo A')],hasMore:true}));
 expect(options?.signal?.aborted).toBe(true);expect(screen.queryByText('Antigo A')).toBeNull();
});
it('does not append a previous term page or show its late failure',async()=>{
 const more=deferred();fake.search.mockResolvedValueOnce({data:[row('a','Primeira A')],hasMore:true}).mockReturnValueOnce(more.promise).mockResolvedValue({data:[row('b','Atual B')],hasMore:false});render(<NutritionistFoodsPage/>);
 fireEvent.change(input(),{target:{value:'Primeira A'}});await screen.findByText('Primeira A');await act(async()=>fake.observers.at(-1).callback([{isIntersecting:true}]));await waitFor(()=>expect(fake.search).toHaveBeenCalledTimes(2));
 fireEvent.change(input(),{target:{value:'Atual B'}});await screen.findByText('Atual B');await act(async()=>more.reject(Object.assign(new Error('old failure'),{status:503})));
 expect(screen.getByText('Atual B')).toBeTruthy();expect(fake.toast).not.toHaveBeenCalled();
});
it('aborts the pending read on unmount',async()=>{
 const old=deferred();fake.search.mockReturnValue(old.promise);const view=render(<NutritionistFoodsPage/>);fireEvent.change(input(),{target:{value:'Antigo A'}});await waitFor(()=>expect(fake.search).toHaveBeenCalledTimes(1));const options=fake.search.mock.calls[0][3];view.unmount();expect(options?.signal?.aborted).toBe(true);await act(async()=>old.resolve({data:[],hasMore:false}));
});
it('offers recovery for a failed current search without claiming a confirmed empty result',async()=>{
 fake.search.mockRejectedValueOnce(Object.assign(new Error('network unavailable'),{status:503})).mockResolvedValue({data:[row('a','Recuperado')],hasMore:false});render(<NutritionistFoodsPage/>);fireEvent.change(input(),{target:{value:'Busca atual'}});
 await screen.findByRole('alert');expect(screen.queryByText(/Nenhum alimento encontrado/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await screen.findByText('Recuperado');expect(fake.search).toHaveBeenCalledTimes(2);
});
it('retries the failed append page and joins repeated observer triggers',async()=>{
 const more=deferred();fake.search.mockResolvedValueOnce({data:[row('a','Primeira A')],hasMore:true}).mockReturnValueOnce(more.promise).mockResolvedValue({data:[row('b','Segunda A')],hasMore:false});render(<NutritionistFoodsPage/>);fireEvent.change(input(),{target:{value:'Busca atual'}});await screen.findByText('Primeira A');
 fireEvent.click(screen.getByRole('button',{name:'Carregar mais'}));await act(async()=>{fake.observers.at(-1).callback([{isIntersecting:true}]);fake.observers.at(-1).callback([{isIntersecting:true}]);});expect(fake.search).toHaveBeenCalledTimes(2);
 await act(async()=>more.reject(Object.assign(new Error('network unavailable'),{status:503})));expect(screen.getByText('Primeira A')).toBeTruthy();
 await act(async()=>fake.observers.at(-1).callback([{isIntersecting:true}]));expect(fake.search).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));await screen.findByText('Segunda A');expect(fake.search.mock.calls.map(call=>call[1])).toEqual([0,1,1]);
});

it('keeps append recovery beside the last confirmed item without an inactive load-more action',async()=>{
 fake.search.mockResolvedValueOnce({data:[row('a','Último confirmado')],hasMore:true}).mockRejectedValueOnce(Object.assign(new Error('network unavailable'),{status:503}));render(<NutritionistFoodsPage/>);fireEvent.change(input(),{target:{value:'Busca atual'}});const last=await screen.findByText('Último confirmado');
 fireEvent.click(screen.getByRole('button',{name:'Carregar mais'}));const alert=await screen.findByRole('alert');
 expect(last.compareDocumentPosition(alert)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(screen.queryByRole('button',{name:'Carregar mais'})).toBeNull();expect(screen.getByRole('button',{name:'Tentar novamente'})).toBeTruthy();expect(screen.getByText('Último confirmado')).toBe(last);
});
