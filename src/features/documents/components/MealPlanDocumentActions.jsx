import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, FileSignature, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createDocumentArtifactFromMealPlan, finalizeDocumentArtifact, getDocumentArtifact, listDocumentArtifacts, signDocumentArtifact } from '../api/document-queries';
import { downloadCanonicalDocumentPdf } from '../pdf/render-canonical-document';

export default function MealPlanDocumentActions({ plan, patientId }) {
  const { toast } = useToast();
  const [artifact, setArtifact] = useState(null);
  const [working, setWorking] = useState(false);
  const load = useCallback(async () => {
    if (!plan?.care_episode_id) return;
    const { data } = await listDocumentArtifacts(patientId, plan.care_episode_id);
    setArtifact((data || []).find((item) => item.source_type === 'meal_plan' && item.source_key === String(plan.id) && !['invalidated', 'superseded'].includes(item.status)) || null);
  }, [patientId, plan?.care_episode_id, plan?.id]);
  useEffect(() => { void load(); }, [load]);

  const run = async (operation, success) => {
    setWorking(true);
    const result = await operation();
    setWorking(false);
    if (result.error) { toast({ title: 'Documento não atualizado', description: 'O plano foi preservado. Revise sua identidade profissional e tente novamente.', variant: 'destructive' }); return; }
    await load();
    toast({ title: success });
  };
  const download = async () => {
    setWorking(true);
    const { data, error } = await getDocumentArtifact(artifact.id);
    try { if (error) throw error; await downloadCanonicalDocumentPdf(data); }
    catch { toast({ title: 'PDF não gerado', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  if (!plan || plan.is_draft) return <Badge variant="outline">Finalize o plano para emitir o documento oficial</Badge>;
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4 text-primary" />}<span className="mr-auto text-sm font-medium">Documento oficial do plano</span>{!artifact ? <Button size="sm" variant="outline" onClick={() => void run(() => createDocumentArtifactFromMealPlan(plan.id), 'Documento preparado para revisão')}>Preparar</Button> : null}{artifact?.status === 'draft' ? <Button size="sm" variant="outline" onClick={() => void run(() => finalizeDocumentArtifact(artifact.id, artifact.revision), 'Documento finalizado e congelado')}><CheckCircle2 className="mr-2 h-4 w-4" />Finalizar</Button> : null}{artifact?.status === 'finalized' ? <Button size="sm" onClick={() => void run(() => signDocumentArtifact(artifact.id), 'Documento assinado')}><FileSignature className="mr-2 h-4 w-4" />Assinar</Button> : null}{artifact?.status === 'signed' ? <Button size="sm" variant="outline" disabled={working} onClick={() => void download()}><Download className="mr-2 h-4 w-4" />PDF oficial</Button> : null}</div>;
}
