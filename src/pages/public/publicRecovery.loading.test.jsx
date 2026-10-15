import React from 'react';import {afterEach,beforeEach,expect,it,vi}from'vitest';
import {act,fireEvent,render,screen,waitFor,cleanup}from'@testing-library/react';import{MemoryRouter,Routes,Route}from'react-router-dom';
import StatusPage from './StatusPage';import DocumentAuthenticityPage from './DocumentAuthenticityPage';
import{verifyDocumentAuthenticity}from'@/features/documents/api/document-queries';
vi.mock('@/features/documents/api/document-queries',()=>({verifyDocumentAuthenticity:vi.fn()}));
vi.mock('./PublicSiteLayout',()=>({default:({children})=><>{children}</>}));
const health=()=>({schemaVersion:1,checkedAt:new Date().toISOString(),status:'operational',checks:{auth:'operational',database:'operational',storage:'operational'},incidents:[]});
beforeEach(()=>vi.clearAllMocks());afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers()});
it('preserves a timestamped historical status and offers immediate recovery after refresh failure',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(health()),{headers:{'content-type':'application/json'}})).mockRejectedValue(new TypeError('Failed to fetch')));
 render(<MemoryRouter><StatusPage/></MemoryRouter>);await screen.findByText(/Última verificação:/);
 fireEvent.click(screen.getByRole('button',{name:'Verificar novamente'}));await screen.findByText('Não foi possível verificar a disponibilidade');
 expect(screen.getByText(/Última verificação:/)).toBeInTheDocument();expect(screen.getByText(/Última verificação desatualizada/i)).toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Operacional'})).toBeNull();
});
it('can actually retry the same authenticity code without a route change',async()=>{
 verifyDocumentAuthenticity.mockResolvedValueOnce({data:null,error:{status:503}}).mockResolvedValue({data:{found:false},error:null});
 render(<MemoryRouter initialEntries={['/verificar-documento/00000000-0000-4000-8000-000000000001']}><Routes><Route path="/verificar-documento/:code?"element={<DocumentAuthenticityPage/>}/></Routes></MemoryRouter>);
 await screen.findByText(/Não foi possível verificar agora/);fireEvent.click(screen.getByRole('button',{name:'Tentar verificar novamente'}));await screen.findByText('Documento não encontrado');expect(verifyDocumentAuthenticity).toHaveBeenCalledTimes(2);
});
it('does not retain a fresh green label after the confirmed snapshot expires',async()=>{
 vi.useFakeTimers();const body=health();body.checkedAt=new Date(Date.now()-59000).toISOString();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})).mockImplementation(()=>new Promise(()=>{})));
 render(<MemoryRouter><StatusPage/></MemoryRouter>);await act(async()=>vi.advanceTimersByTimeAsync(1));expect(screen.getByRole('heading',{name:'Operacional'})).toBeInTheDocument();
 await act(async()=>vi.advanceTimersByTimeAsync(1001));expect(screen.queryByRole('heading',{name:'Operacional'})).toBeNull();expect(screen.getByText(/Última verificação desatualizada/)).toBeInTheDocument();
});
it('respects the server cooldown and then retries the same code once',async()=>{
 vi.useFakeTimers();verifyDocumentAuthenticity.mockResolvedValueOnce({data:{found:false,rate_limited:true,retry_after_seconds:2},error:null}).mockResolvedValue({data:{found:false},error:null});
 render(<MemoryRouter initialEntries={['/verificar-documento/00000000-0000-4000-8000-000000000001']}><Routes><Route path="/verificar-documento/:code?"element={<DocumentAuthenticityPage/>}/></Routes></MemoryRouter>);await act(async()=>vi.advanceTimersByTimeAsync(1));
 const retry=screen.getByRole('button',{name:'Verificar novamente',exact:true});expect(retry).toBeDisabled();fireEvent.click(retry);expect(verifyDocumentAuthenticity).toHaveBeenCalledTimes(1);
 await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(retry).toBeEnabled();await act(async()=>fireEvent.click(retry));expect(verifyDocumentAuthenticity).toHaveBeenCalledTimes(2);expect(screen.getByText('Documento não encontrado')).toBeInTheDocument();
});
