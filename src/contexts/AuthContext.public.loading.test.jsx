import{AuthProvider}from'./AuthContext';
import React from 'react';import{beforeEach,afterEach,it,expect,vi}from'vitest';import{render,screen,fireEvent,act,cleanup}from'@testing-library/react';import{MemoryRouter}from'react-router-dom';
const api=vi.hoisted(()=>({callback:null}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({clear:vi.fn(),invalidateQueries:vi.fn()})}));
vi.mock('@/hooks/useProfile',()=>({useProfile:id=>({data:id?{id,user_type:'patient'}:null,isError:false,refetch:vi.fn()})}));
vi.mock('@/infrastructure/supabase/client',()=>({supabase:{auth:{getSession:()=>new Promise(()=>{}),onAuthStateChange:callback=>{api.callback=callback;return{data:{subscription:{unsubscribe:vi.fn()}}}},signOut:vi.fn()}}}));
vi.mock('@/infrastructure/observability/telemetry',()=>({captureOperationalError:vi.fn(),clearObservabilityUser:vi.fn(),setObservabilityUser:vi.fn()}));
vi.mock('@/infrastructure/analytics/posthog',()=>({track:vi.fn(),Events:{}}));
vi.mock('@/lib/supabase/verification-queries',()=>({getMyProfessionalVerification:vi.fn()}));
const view=path=><MemoryRouter initialEntries={[path]}><AuthProvider><p>Conteúdo de teste</p><input aria-label="Rascunho público"defaultValue=""/></AuthProvider></MemoryRouter>;
beforeEach(()=>{api.callback=null;sessionStorage.clear();localStorage.clear()});afterEach(cleanup);
it.each(['/status/','/pesquisa','/pesquisa//','/f/SYNTHETIC','/verificar-documento','/verificar-documento/SYNTHETIC','/auth/verify','/convite'])('does not block %s on a stalled session initialization',path=>{render(view(path));expect(screen.getByText('Conteúdo de teste')).toBeInTheDocument()});
it.each(['/nutritionist/dashboard','/patient/inicio','/admin/dashboard','/pesquisa-extra','/f/TOKEN/extra','/verificar-documento/CODE/extra'])('does not bypass the private or unmatched path %s',path=>{render(view(path));expect(screen.queryByText('Conteúdo de teste')).toBeNull()});
it('does not remount a token-bound public draft when an unrelated Auth identity arrives',async()=>{
 render(view('/f/SYNTHETIC'));const input=screen.getByLabelText('Rascunho público');fireEvent.change(input,{target:{value:'resposta fictícia'}});input.focus();
 await act(async()=>api.callback('SIGNED_IN',{user:{id:'actor-a'}}));expect(screen.getByLabelText('Rascunho público')).toBe(input);expect(input).toHaveValue('resposta fictícia');expect(input).toHaveFocus();
});
