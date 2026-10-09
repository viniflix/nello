import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import DocumentAuthenticityPage from './DocumentAuthenticityPage';
import { verifyDocumentAuthenticity } from '@/features/documents/api/document-queries';
vi.mock('@/features/documents/api/document-queries', () => ({ verifyDocumentAuthenticity: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function Navigation() {
 const navigate = useNavigate();
 return <><button onClick={() => navigate('/verificar-documento/B')}>Outro código</button><button onClick={() => navigate('/verificar-documento')}>Limpar consulta</button></>;
}
function setup() { render(<MemoryRouter initialEntries={['/verificar-documento/A']}><Navigation /><Routes><Route path="/verificar-documento/:code?" element={<DocumentAuthenticityPage />} /></Routes></MemoryRouter>); }
it('keeps the URL, input and result aligned across pending lookups and an empty URL', async () => {
 let resolveFirst;
 vi.mocked(verifyDocumentAuthenticity).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValue({ data: { found:false }, error:null });
 setup();
 fireEvent.click(screen.getByText('Outro código'));
 await screen.findByText('Documento não encontrado');
 expect(screen.getByLabelText('Código de autenticidade')).toHaveValue('B');
 await act(async () => resolveFirst({ data:{ found:true, issuer:'OBSOLETE', professional:{name:'OLD'} }, error:null }));
 expect(screen.queryByText('OLD')).not.toBeInTheDocument();
 fireEvent.click(screen.getByText('Limpar consulta'));
 expect(screen.getByLabelText('Código de autenticidade')).toHaveValue('');
 expect(screen.queryByText('Documento não encontrado')).not.toBeInTheDocument();
});
it('distinguishes throttling from a nonexistent document', async () => {
 vi.mocked(verifyDocumentAuthenticity).mockResolvedValue({ data:{ found:false, rate_limited:true, retry_after_seconds:60 }, error:null });
 setup();
 await screen.findByText(/Limite de consultas atingido/);
 expect(screen.queryByText('Documento não encontrado')).not.toBeInTheDocument();
});
it('shows a recoverable error if the lookup rejects', async () => {
 vi.mocked(verifyDocumentAuthenticity).mockRejectedValue(new Error('offline'));
 setup();
 await waitFor(() => expect(screen.getByText(/Não foi possível verificar agora/)).toBeInTheDocument());
});
