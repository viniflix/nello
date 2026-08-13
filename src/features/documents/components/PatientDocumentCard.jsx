import { useEffect, useState } from 'react';
import { FileCheck2, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listDocumentArtifacts } from '../api/document-queries';

export default function PatientDocumentCard({ record }) {
  const [artifact, setArtifact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void listDocumentArtifacts(record.patient_id, record.care_episode_id).then(({ data }) => {
      if (!current) return;
      setArtifact((data || []).find((candidate) => candidate.source_id === record.id && candidate.status === 'signed') || null);
      setLoading(false);
    });
    return () => { current = false; };
  }, [record.care_episode_id, record.id, record.patient_id]);

  if (loading) return <div role="status" className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Consultando documento oficial...</div>;
  if (!artifact) return null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2 text-base uppercase"><FileCheck2 className="h-5 w-5 text-emerald-700" />Documento oficial</CardTitle><CardDescription>Versão assinada e compartilhada pelo nutricionista.</CardDescription></div>
          <Badge className="bg-emerald-700"><ShieldCheck className="mr-1 h-3 w-3" />Autêntico</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase text-slate-500">Hash SHA-256</p><p className="mt-1 break-all font-mono text-xs text-slate-700">{artifact.sha256}</p></div>
        <div><p className="text-xs font-semibold uppercase text-slate-500">Código de autenticidade</p><p className="mt-1 break-all font-mono text-xs text-slate-700">{artifact.authenticity_code}</p></div>
      </CardContent>
    </Card>
  );
}
