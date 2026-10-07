import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSignature, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createDocumentArtifactFromMealPlan, finalizeDocumentArtifact, getDocumentArtifact, listDocumentArtifacts, signDocumentArtifact } from '../api/document-queries';
import { documentFailurePresentation } from '../model/documentFailure';
import { downloadCanonicalDocumentPdf } from '../pdf/render-canonical-document';

export default function MealPlanDocumentActions({ plan, patientId }) {
  if (!plan || plan.is_draft) return <Badge variant="outline">Finalize o plano para emitir o documento oficial</Badge>;
  // A new clinical scope owns a new state; late responses cannot cross plans.
  return <DocumentActions key={JSON.stringify([patientId, plan.care_episode_id, plan.id])} plan={plan} patientId={patientId} />;
}

function DocumentActions({ plan, patientId }) {
  const { toast } = useToast();
  const [artifact, setArtifact] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [identityRequired, setIdentityRequired] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const active = useRef(false);
  const request = useRef(0);
  const mutation = useRef(false);
  const busy = loading || working;

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      if (!plan.care_episode_id || !patientId) throw new Error('document_scope_required');
      const { data, error } = await listDocumentArtifacts(patientId, plan.care_episode_id);
      if (!active.current || current !== request.current) return false;
      if (error || !Array.isArray(data)) throw error || new Error('document_list_invalid');
      setArtifact(data.find(item => item.source_type === 'meal_plan' && item.source_key === String(plan.id) && !['invalidated', 'superseded'].includes(item.status)) || null);
      setLoadError(false);
      setNeedsRefresh(false);
      return true;
    } catch {
      if (active.current && current === request.current) setLoadError(true);
      return false;
    } finally {
      if (active.current && current === request.current) setLoading(false);
    }
  }, [patientId, plan.care_episode_id, plan.id]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; request.current += 1; };
  }, [load]);

  const run = async (operation, success) => {
    if (busy || loadError || mutation.current) return;
    mutation.current = true;
    setWorking(true);
    setIdentityRequired(false);
    try {
      const result = await operation();
      if (!active.current) return;
      if (result.error) throw result.error;
      const refreshed = await load();
      if (active.current) toast({ title: success, description: refreshed ? undefined : 'A ação foi concluída, mas a consulta dos documentos falhou. Atualize os documentos antes de continuar.' });
    } catch (error) {
      if (!active.current) return;
      const failure = documentFailurePresentation(error);
      setIdentityRequired(failure.identityRequired === true);
      setNeedsRefresh(true);
      toast({ title: 'Documento não atualizado', description: failure.message, variant: 'destructive' });
    } finally {
      mutation.current = false;
      if (active.current) setWorking(false);
    }
  };

  const download = async () => {
    if (busy || loadError || mutation.current || !artifact) return;
    mutation.current = true;
    setWorking(true);
    try {
      const { data, error } = await getDocumentArtifact(artifact.id);
      if (!active.current) return;
      if (error) throw error;
      await downloadCanonicalDocumentPdf(data);
    } catch {
      if (active.current) toast({ title: 'PDF não gerado', description: 'O documento oficial continua preservado. Tente novamente.', variant: 'destructive' });
    } finally {
      mutation.current = false;
      if (active.current) setWorking(false);
    }
  };

  return <div aria-busy={busy} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
    {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileSignature aria-hidden="true" className="h-4 w-4 text-primary" />}
    <span className="mr-auto text-sm font-medium">Documento oficial do plano</span>
    {loading ? <span role="status" className="text-sm text-muted-foreground">Consultando documentos…</span> : null}
    {loadError ? <div className="w-full space-y-2"><p role="alert" className="text-sm">Não foi possível consultar os documentos do plano. Tente novamente antes de preparar outro.</p><Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Tentar novamente</Button></div> : <>
      {!artifact ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => createDocumentArtifactFromMealPlan(plan.id), 'Documento preparado para revisão')}>Preparar</Button> : null}
      {artifact?.status === 'draft' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => finalizeDocumentArtifact(artifact.id, artifact.revision), 'Documento finalizado e congelado')}><CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />Finalizar</Button> : null}
      {artifact?.status === 'finalized' ? <Button size="sm" disabled={busy} onClick={() => void run(() => signDocumentArtifact(artifact.id), 'Documento assinado')}><FileSignature aria-hidden="true" className="mr-2 h-4 w-4" />Assinar</Button> : null}
      {artifact?.status === 'signed' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void download()}><Download aria-hidden="true" className="mr-2 h-4 w-4" />PDF oficial</Button> : null}
      {artifact || needsRefresh ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>Atualizar documentos</Button> : null}
    </>}
    {identityRequired ? <a className="w-full text-sm underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" href="/nutritionist/profile?tab=documents">Configurar identidade documental</a> : null}
  </div>;
}
