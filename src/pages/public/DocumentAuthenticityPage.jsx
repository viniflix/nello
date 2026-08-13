import { useEffect, useState } from 'react';
import { AlertCircle, FileCheck2, Loader2, Search, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { verifyDocumentAuthenticity } from '@/features/documents/api/document-queries';

const STATUS = { signed: 'Assinado', invalidated: 'Invalidado', superseded: 'Substituído' };

export default function DocumentAuthenticityPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(code || '');
  const [result, setResult] = useState(null);
  const [state, setState] = useState(code ? 'loading' : 'idle');

  useEffect(() => {
    let current = true;
    if (!code) return undefined;
    setState('loading');
    void verifyDocumentAuthenticity(code).then(({ data, error }) => {
      if (!current) return;
      setResult(error ? null : data);
      setState(error ? 'error' : 'ready');
    });
    return () => { current = false; };
  }, [code]);

  const submit = (event) => {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized) navigate(`/verificar-documento/${encodeURIComponent(normalized)}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><FileCheck2 /></div><h1 className="mt-4 text-2xl font-bold uppercase">Verificar documento</h1><p className="mt-2 text-sm text-slate-600">Consulte a autenticidade sem expor dados do paciente ou o conteúdo clínico.</p></header>
        <Card><CardContent className="pt-6"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit}><Input aria-label="Código de autenticidade" required value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Informe o código do documento" /><Button type="submit"><Search className="mr-2 h-4 w-4" />Verificar</Button></form></CardContent></Card>

        {state === 'loading' ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Verificando autenticidade...</div> : null}
        {state === 'error' ? <Card className="border-red-200"><CardContent className="flex gap-3 py-6 text-red-700"><AlertCircle /><p>Não foi possível verificar agora. Tente novamente em alguns instantes.</p></CardContent></Card> : null}
        {state === 'ready' && !result?.found ? <Card className="border-amber-200"><CardContent className="flex gap-3 py-6 text-amber-800"><AlertCircle /><div><p className="font-semibold">Documento não encontrado</p><p className="mt-1 text-sm">Confira o código. Por privacidade, nenhum outro dado é exibido.</p></div></CardContent></Card> : null}
        {state === 'ready' && result?.found ? (
          <Card className="border-emerald-200">
            <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 uppercase"><ShieldCheck className="text-emerald-700" />Documento localizado</CardTitle><CardDescription>Emissor: {result.issuer}</CardDescription></div><Badge className={result.status === 'signed' ? 'bg-emerald-700' : 'bg-amber-700'}>{STATUS[result.status] || result.status}</Badge></div></CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div><p className="text-xs font-semibold uppercase text-slate-500">Profissional</p><p className="mt-1 font-semibold">{result.professional?.name}</p><p>{result.professional?.crn_region} {result.professional?.crn_number}</p></div>
              <div><p className="text-xs font-semibold uppercase text-slate-500">Assinado em</p><p className="mt-1">{result.signed_at ? new Date(result.signed_at).toLocaleString('pt-BR') : 'Não informado'}</p></div>
              <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase text-slate-500">Hash SHA-256</p><p className="mt-1 break-all font-mono text-xs">{result.integrity?.sha256}</p></div>
              {result.status !== 'signed' ? <p className="rounded bg-amber-50 p-3 text-amber-900 sm:col-span-2">Este documento permanece autêntico e auditável, mas não está mais vigente.</p> : null}
            </CardContent>
          </Card>
        ) : null}
        <p className="text-center text-xs uppercase tracking-wide text-slate-400">Verificação pública Nello • Dados clínicos protegidos</p>
      </div>
    </main>
  );
}
