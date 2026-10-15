import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import PatientFacingUi from './PatientFacingUi';
import {clearMemoryDrafts} from '@/lib/utils/memoryDrafts';
const state=vi.hoisted(()=>({rpc:vi.fn(),toast:vi.fn(),deny:false,transient:false,epoch:0}));
vi.mock('@/lib/utils/privateSessionState',()=>({getPrivateSessionEpoch:()=>state.epoch}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{rpc:state.rpc}}));
vi.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:state.toast})}));
vi.mock('@/hooks/useAnamnesisAttachments',()=>({useAnamnesisAttachments:()=>({uploadAttachment:{isPending:false},deleteAttachment:{isPending:false},getSignedUrl:vi.fn()})}));
const record=()=>({id:'synthetic-record',updated_at:new Date().toISOString(),status:'pending_patient',content:{rf_answer:'Resposta fictícia'},lgpd_consented:false,template:{title:'Synthetic public form',sections:[{id:'section',title:'Synthetic section',fields:[{id:'rf_answer',type:'text',label:'Resposta sintética',required:true}]}]}});
const renderForm=()=>{const token=crypto.randomUUID();return render(<MemoryRouter initialEntries={['/f/'+token]}><Routes><Route path="/f/:token" element={<PatientFacingUi/>}/></Routes></MemoryRouter>)};
beforeEach(()=>{vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();});
beforeEach(()=>{clearMemoryDrafts();state.epoch=0;state.deny=false;state.transient=false;state.rpc.mockReset();state.toast.mockClear();state.rpc.mockImplementation(async name=>name==='get_anamnesis_draft_revision'?{data:record(),error:null}:state.deny?{data:null,error:{code:'42501',message:'invalid_anamnesis_link'}}:state.transient?{data:null,error:{code:'503',message:'local transient'}}:{data:{updated_at:new Date().toISOString()},error:null});});
describe('Public capability denial and recovery',()=>{
 it('continues authorized capability saving after the unrelated private identity epoch changes',async()=>{
  renderForm();await screen.findByText('Synthetic public form');state.epoch+=1;fireEvent.change(screen.getByPlaceholderText('Sua resposta...'),{target:{value:'Public draft after private logout'}});fireEvent.click(screen.getByRole('button',{name:'Salvar Rascunho e Sair'}));
  await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('save_anamnesis_draft_revision',expect.objectContaining({p_content:{rf_answer:'Public draft after private logout'}})));
  expect(screen.getByPlaceholderText('Sua resposta...')).toHaveValue('Public draft after private logout');
 });
 it('closes a revoked public form after an actual completion denial without a success acknowledgement',async()=>{
  renderForm();await screen.findByText('Synthetic public form');fireEvent.click(screen.getByRole('button',{name:'Próximo'}));fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Salvar Rascunho e Sair'}));await screen.findByText('Salvo no servidor');state.toast.mockClear();state.deny=true;fireEvent.click(screen.getByRole('button',{name:'Concluir e Enviar'}));
  await screen.findByText('Link Inválido');expect(screen.queryByRole('button',{name:'Concluir e Enviar'})).toBeNull();expect(screen.queryByText('Synthetic public form')).toBeNull();expect(state.toast.mock.calls.some(([x])=>x.title==='Questionário enviado!')).toBe(false);
 });
 it('closes the form on revoked-token autosave denial',async()=>{
  renderForm();await screen.findByText('Synthetic public form');state.deny=true;fireEvent.change(screen.getByPlaceholderText('Sua resposta...'),{target:{value:'Private synthetic response'}});fireEvent.click(screen.getByRole('button',{name:'Salvar Rascunho e Sair'}));
  await screen.findByText('Link Inválido');expect(screen.queryByRole('textbox')).toBeNull();
 });
 it('keeps entered responses for a transient save failure and offers retry rather than invalidating the link',async()=>{
  renderForm();await screen.findByText('Synthetic public form');state.transient=true;fireEvent.change(screen.getByPlaceholderText('Sua resposta...'),{target:{value:'Retained synthetic response'}});fireEvent.click(screen.getByRole('button',{name:'Salvar Rascunho e Sair'}));await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('save_anamnesis_draft_revision',expect.anything()));
  expect(screen.getByPlaceholderText('Sua resposta...')).toHaveValue('Retained synthetic response');expect(screen.queryByText('Link Inválido')).toBeNull();
 });
 it('associates the public field label with its native control',async()=>{
  renderForm();await screen.findByText('Synthetic public form');expect(screen.getByLabelText(/Resposta sintética/)).toHaveValue('Resposta fictícia');
 });
});
