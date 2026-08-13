import { useState } from 'react';
import { Download, Loader2, PackageCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getDataExportAttachmentUrl, getMyDataExportSnapshot } from '../api/data-portability-queries';
import { buildPortabilityZip, safeFilename, summarizePortabilitySnapshot } from '../model/export-package';

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export default function DataPortabilitySection() {
  const { toast } = useToast();
  const [state, setState] = useState('idle');
  const [summary, setSummary] = useState(null);

  const exportData = async () => {
    setState('working');
    try {
      const { data, error } = await getMyDataExportSnapshot();
      if (error || !data) throw error || new Error('empty_export_snapshot');
      const nextSummary = summarizePortabilitySnapshot(data);
      setSummary(nextSummary);
      const blob = await buildPortabilityZip(data, getDataExportAttachmentUrl);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `nello-meus-dados-${safeFilename(data.subject?.name, 'paciente')}-${stamp}.zip`);
      setState('done');
      toast({ title: 'Cópia dos seus dados pronta', description: 'O pacote ZIP foi baixado neste dispositivo.' });
    } catch (error) {
      setState('error');
      toast({ title: 'Não foi possível gerar a cópia', description: 'Nenhum dado foi alterado. Tente novamente ou solicite suporte.', variant: 'destructive' });
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg uppercase"><ShieldCheck className="h-5 w-5 text-blue-700" />Meus dados e portabilidade</CardTitle>
        <CardDescription>Gere uma cópia privada sob demanda. O pacote não cria links públicos nem duplica seus dados no Nello.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">O pacote inclui:</p>
          <p className="mt-1">PDF de leitura, JSON completo, índice CSV e anexos autorizados em uma única pasta ZIP.</p>
        </div>
        {summary ? <p role="status" className="flex items-center gap-2 text-sm text-emerald-800"><PackageCheck className="h-4 w-4" />{summary.recordCount} registros e {summary.attachmentCount} anexos catalogados.</p> : null}
        <Button onClick={() => void exportData()} disabled={state === 'working'}>
          {state === 'working' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {state === 'working' ? 'Preparando pacote privado...' : 'Baixar cópia dos meus dados'}
        </Button>
      </CardContent>
    </Card>
  );
}
