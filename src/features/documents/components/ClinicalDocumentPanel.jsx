import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileSignature, FileText, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  createDocumentArtifactFromClinicalRecord,
  finalizeDocumentArtifact,
  listDocumentArtifacts,
  signDocumentArtifact,
} from '../api/document-queries';

const STATUS = {
  draft: 'Rascunho documental',
  finalized: 'Pronto para assinatura',
  signed: 'Documento assinado',
  invalidated: 'Documento invalidado',
  superseded: 'Documento substituído',
};

const failureMessage = (error) => {
  const value = error?.message || '';
  if (value.includes('responsible_document_identity_required')) return 'Configure a identidade documental do profissional responsável antes de emitir.';
  if (value.includes('document_artifact_revision_conflict')) return 'O documento foi atualizado em outra sessão. Recarregue antes de continuar.';
  if (value.includes('document_signature_requires_current_verified_crn')) return 'A assinatura exige um CRN aprovado e vigente.';
  return 'Não foi possível avançar o documento. Nenhum registro clínico foi alterado.';
};

export default function ClinicalDocumentPanel({ record, currentUserId }) {
  const { toast } = useToast();
  const [artifact, setArtifact] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!record?.patient_id || !record?.care_episode_id) return;
    setState('loading');
    setError(null);
    const result = await listDocumentArtifacts(record.patient_id, record.care_episode_id);
    if (result.error) {
      setState('error');
      setError(failureMessage(result.error));
      return;
    }
    const related = (result.data || []).find((candidate) => (
      candidate?.source_type === 'clinical_record' && candidate?.source_id === record.id
    ));
    setArtifact(related || null);
    setState('ready');
  }, [record?.care_episode_id, record?.id, record?.patient_id]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setState('working');
    const result = await createDocumentArtifactFromClinicalRecord(record.id, record.visibility);
    if (result.error) {
      setState('ready');
      toast({ title: 'Documento não criado', description: failureMessage(result.error), variant: 'destructive' });
      return;
    }
    setArtifact({ ...result.data, source_type: 'clinical_record', source_id: record.id });
    setState('ready');
  };

  const finalize = async () => {
    setState('working');
    const result = await finalizeDocumentArtifact(artifact.id || artifact.artifact_id, artifact.revision);
    if (result.error) {
      setState('ready');
      toast({ title: 'Documento não finalizado', description: failureMessage(result.error), variant: 'destructive' });
      return;
    }
    setArtifact((current) => ({ ...current, ...result.data, id: result.data.artifact_id }));
    setState('ready');
    toast({ title: 'Documento finalizado', description: 'O conteúdo canônico e o hash SHA-256 foram congelados.' });
  };

  const sign = async () => {
    setState('working');
    const result = await signDocumentArtifact(artifact.id || artifact.artifact_id);
    if (result.error) {
      setState('ready');
      toast({ title: 'Documento não assinado', description: failureMessage(result.error), variant: 'destructive' });
      return;
    }
    await load();
    toast({ title: 'Documento assinado', description: 'Autenticidade pública e trilha de auditoria foram geradas.' });
  };

  if (!record || !['signed', 'corrected'].includes(record.status)) return null;

  const responsibleId = record.nutritionist_id;
  const isResponsible = currentUserId === responsibleId;
  const isPreparer = isResponsible || currentUserId === record.student_id || currentUserId === record.supervisor_id;
  const busy = state === 'loading' || state === 'working';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2 uppercase"><FileSignature className="h-5 w-5" />Documento oficial</CardTitle><CardDescription>Artefato versionado, imutável após finalização e verificável pelo código de autenticidade.</CardDescription></div>
          {artifact ? <Badge variant="secondary">{STATUS[artifact.status] || artifact.status}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'error' ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {!artifact ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">O registro está assinado, mas ainda não possui sua versão documental oficial.</p>
            {isPreparer ? <Button onClick={() => void create()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Preparar documento</Button> : null}
          </div>
        ) : null}
        {artifact?.status === 'draft' ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Revise o preview da identidade antes de congelar esta versão.</p><Button onClick={() => void finalize()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Finalizar documento</Button></div> : null}
        {artifact?.status === 'finalized' ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Hash gerado. Somente o nutricionista responsável pode concluir a assinatura.</p>{isResponsible ? <Button onClick={() => void sign()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}Assinar documento</Button> : <Badge variant="outline">Aguardando nutricionista responsável</Badge>}</div> : null}
        {artifact?.status === 'signed' ? <Alert><ShieldCheck className="h-4 w-4 text-emerald-600" /><AlertDescription><strong>Documento autêntico.</strong> Hash SHA-256 preservado e código público gerado sem expor dados do paciente.</AlertDescription></Alert> : null}
        {artifact && state === 'error' ? <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Recarregar</Button> : null}
      </CardContent>
    </Card>
  );
}
