import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import Gate from './AdminAccessGate';
import IntelligenceRecordEditor from './IntelligenceRecordEditor';
import SupportCasePanel from './SupportCasePanel';
import Foods from '@/pages/nutritionist/tools/NutritionistFoodsPage';
const m=vi.hoisted(()=>({rpc:vi.fn(),save:vi.fn(),saved:vi.fn(),compose:vi.fn(),update:vi.fn(),case:vi.fn(),toast:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'e05-editors'},isOffline:false})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{rpc:m.rpc,from:()=>{const q={select:()=>q,eq:()=>q,then:r=>Promise.resolve({count:0}).then(r)};return q},auth:{mfa:{listFactors:async()=>({data:{totp:[]}})}}}}));
vi.mock('@/features/admin/services/intelligenceService',()=>({intelligenceSave:m.save,intelligenceHistory:vi.fn()}));
vi.mock('@/features/admin/services/supportService',()=>({supportCase:m.case,supportCompose:m.compose,supportUpdate:m.update,supportGateway:vi.fn()}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:m.toast})}));
vi.mock('@/lib/supabase/foodService',()=>({searchFoodsPaginated:vi.fn(),getFoodMeasures:vi.fn()}));
vi.mock('@/components/nutritionist/FoodMeasureManager',()=>({default:()=>null}));
vi.mock('@/components/nutrition/SmartFoodForm',()=>({default:()=> <div>Formulário fictício de alimento</div>}));
const entry={id:'00000000-0000-4000-8000-000000000555',revision:1,payload:{title:'Decisão fictícia',evidence:'Evidência fictícia local',action:'Ação fictícia pendente',expected:'Resultado fictício futuro',review_on:'2026-10-20',outcome:'planned',result:''}};
beforeEach(()=>{vi.stubGlobal('IntersectionObserver',class{observe(){}unobserve(){}disconnect(){}});vi.clearAllMocks();m.rpc.mockResolvedValue({data:{eligible:true,authorized:true}});m.case.mockResolvedValue({data:{item:{id:'case',subject:'Caso fictício',contact_email:'qa@example.invalid',status:'open',category:'other',module:'other',revision:1},can_write:true,messages:[],events:[]}})});
afterEach(()=>vi.unstubAllGlobals());
const show=children=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><Gate>{children}</Gate></MemoryRouter></QueryClientProvider>);
it('keeps an Intelligence portal draft and rejects both click and submit during gate revalidation',async()=>{
 show(<IntelligenceRecordEditor kind="decision" entry={entry} onClose={()=>{}} onSaved={m.saved}/>);const field=await screen.findByLabelText('Título');fireEvent.change(field,{target:{value:'Texto fictício dirty'}});field.focus();field.setSelectionRange(1,2);
 let finish;m.rpc.mockImplementation(()=>new Promise(r=>finish=r));act(()=>fireEvent.focus(window));
 expect(screen.getByLabelText('Título')).toBe(field);expect(field).toHaveFocus();fireEvent.click(screen.getByRole('button',{name:'Salvar registro'}));fireEvent.submit(field.closest('form'));expect(m.save).not.toHaveBeenCalled();
 await act(async()=>finish({data:true}));expect(field).toHaveValue('Texto fictício dirty');expect(field).toHaveFocus();expect(field.selectionStart).toBe(1);
});
it('ignores an Intelligence save acknowledgement from before an authorization check',async()=>{
 let save;m.save.mockImplementation(()=>new Promise(r=>save=r));show(<IntelligenceRecordEditor kind="decision" entry={entry} onClose={()=>{}} onSaved={m.saved}/>);const field=await screen.findByLabelText('Título');fireEvent.change(screen.getByLabelText('Motivo deste registro ou alteração'),{target:{value:'Motivo fictício válido'}});fireEvent.submit(field.closest('form'));await waitFor(()=>expect(m.save).toHaveBeenCalledTimes(1));
 m.rpc.mockResolvedValue({data:true});await act(async()=>fireEvent.focus(window));await act(async()=>save({data:{success:true,id:entry.id,revision:2}}));expect(m.saved).not.toHaveBeenCalled();expect(field).toHaveValue(entry.payload.title);
});
it('preserves Support compose during a successful access check without preparing a message',async()=>{
 show(<SupportCasePanel id="case" onQueueRefresh={()=>{}} onClose={()=>{}}/>);const field=await screen.findByLabelText('Nota interna');fireEvent.change(field,{target:{value:'Nota fictícia ainda não enviada'}});field.focus();let finish;m.rpc.mockImplementation(()=>new Promise(r=>finish=r));act(()=>fireEvent.focus(window));
 expect(screen.getByLabelText('Nota interna')).toBe(field);fireEvent.submit(field.closest('form'));expect(m.compose).not.toHaveBeenCalled();await act(async()=>finish({data:true}));expect(field).toHaveValue('Nota fictícia ainda não enviada');expect(field).toHaveFocus();
});
it('preserves the actual routed foods workspace input and blocks its create dialog during a check',async()=>{
 show(<Foods/>);const field=await screen.findByPlaceholderText(/Buscar alimento/);fireEvent.change(field,{target:{value:'a'}});field.focus();let finish;m.rpc.mockImplementation(()=>new Promise(r=>finish=r));act(()=>fireEvent.focus(window));fireEvent.click(screen.getByRole('button',{name:'Novo Alimento'}));expect(screen.queryByText('Formulário fictício de alimento')).toBeNull();expect(screen.getByPlaceholderText(/Buscar alimento/)).toBe(field);await act(async()=>finish({data:true}));expect(field).toHaveValue('a');expect(field).toHaveFocus();
});
