import { useCallback, useEffect, useState } from 'react';
import { Download, FileCheck2, FileClock, FilePlus2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  changeClinicalAttachmentVisibility,
  createClinicalAttachmentSignedUrl,
  getMyClinicalDocumentContext,
  invalidateClinicalAttachment,
  listClinicalAttachmentsByEpisode,
  listMyClinicalDocuments,
  reviewPatientClinicalAttachment,
  uploadClinicalAttachment,
} from '../api/attachment-queries';
import {
  CLINICAL_ATTACHMENT_CATEGORIES,
  CLINICAL_ATTACHMENT_STATUS_LABELS,
} from '../model/attachmentSchema';

const formatSize = (bytes) => `${Math.max(0.1, Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('pt-BR').format(new Date(value))
  : 'Data não informada';

const statusVariant = (status) => {
  if (status === 'active') return 'default';
  if (status === 'pending_review') return 'secondary';
  return 'outline';
};

export default function ClinicalAttachmentsPanel({
  audience = 'professional', patientId, episodeId: receivedEpisodeId, clinicalRecordId = null,
  canUpload = true,
}) {
  const { toast } = useToast();
  const [context, setContext] = useState(null);
  const episodeId = receivedEpisodeId || context?.care_episode_id || null;
  const resolvedPatientId = patientId || context?.patient_id || null;
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading');
  const [file, setFile] = useState(null);
  const [categoryCode, setCategoryCode] = useState('patient_document');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  const patientAudience = audience === 'patient';

  const load = useCallback(async () => {
    setState('loading');
    try {
      let activeContext = context;
      if (patientAudience && !receivedEpisodeId && !context?.care_episode_id) {
        activeContext = await getMyClinicalDocumentContext();
        setContext(activeContext);
      }
      const activeEpisodeId = receivedEpisodeId || activeContext?.care_episode_id;
      if (!activeEpisodeId) {
        setItems([]);
        setState('success');
        return;
      }
      const result = patientAudience
        ? await listMyClinicalDocuments(activeEpisodeId)
        : await listClinicalAttachmentsByEpisode(patientId, activeEpisodeId);
      setItems(patientAudience ? result : result.items);
      setState('success');
    } catch {
      setState('error');
    }
  }, [context, patientAudience, patientId, receivedEpisodeId]);

  useEffect(() => { void load(); }, [load]);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file || !resolvedPatientId || !episodeId) return;
    setUploading(true);
    try {
      await uploadClinicalAttachment({
        patientId: resolvedPatientId,
        episodeId,
        clinicalRecordId: patientAudience ? null : clinicalRecordId,
        categoryCode,
        description: description.trim() || null,
        file,
      });
      setFile(null);
      setDescription('');
      const input = document.getElementById(`clinical-attachment-file-${audience}`);
      if (input) input.value = '';
      toast({
        title: patientAudience ? 'Documento enviado para análise' : 'Anexo clínico salvo',
        description: patientAudience
          ? 'O profissional responsável recebeu uma pendência de revisão.'
          : 'O arquivo foi vinculado ao episódio de cuidado.',
      });
      await load();
    } catch (error) {
      toast({
        title: 'Não foi possível enviar o documento',
        description: error?.message || 'Tente novamente. Nenhum envio incompleto será tratado como concluído.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const openAttachment = async (item) => {
    try {
      const { signedUrl } = await createClinicalAttachmentSignedUrl(item.id);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast({ title: 'Documento indisponível', description: 'Não foi possível autorizar a abertura agora.', variant: 'destructive' });
    }
  };

  const runAction = async () => {
    if (!action) return;
    setActing(true);
    try {
      if (action.type === 'accept') {
        await reviewPatientClinicalAttachment(action.item.id, { decision: 'accept' });
      } else if (action.type === 'reject') {
        await reviewPatientClinicalAttachment(action.item.id, { decision: 'reject', reason: reason.trim() });
      } else if (action.type === 'invalidate') {
        await invalidateClinicalAttachment(action.item.id, reason.trim());
      } else if (action.type === 'visibility') {
        await changeClinicalAttachmentVisibility(action.item.id, action.visibility, reason.trim());
      }
      setAction(null);
      setReason('');
      await load();
      toast({ title: 'Documento atualizado', description: 'A ação foi registrada no histórico de auditoria.' });
    } catch (error) {
      toast({ title: 'Ação não concluída', description: error?.message || 'Revise os dados e tente novamente.', variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const requiresReason = action && action.type !== 'accept';
  const uploadAllowed = canUpload && (!patientAudience || context?.can_upload === true || Boolean(receivedEpisodeId));

  return (
    <section className="space-y-4" aria-labelledby={`clinical-attachments-title-${audience}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`clinical-attachments-title-${audience}`} className="text-lg font-bold uppercase tracking-wide">
            {patientAudience ? 'DOCUMENTOS' : 'ANEXOS CLÍNICOS'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {patientAudience
              ? 'Envios em análise e documentos compartilhados pelo seu nutricionista.'
              : 'Arquivos privados, auditáveis e vinculados a este episódio de cuidado.'}
          </p>
        </div>
        {state === 'success' && <Badge variant="outline">{items.length} {items.length === 1 ? 'documento' : 'documentos'}</Badge>}
      </div>

      {uploadAllowed && episodeId && (
        <Card>
          <CardHeader><CardTitle className="text-base uppercase">ENVIAR DOCUMENTO</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpload}>
              <div className="space-y-2">
                <Label htmlFor={`clinical-attachment-file-${audience}`}>Arquivo PDF ou imagem (até 15 MB)</Label>
                <Input id={`clinical-attachment-file-${audience}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`clinical-attachment-category-${audience}`}>Categoria</Label>
                <select id={`clinical-attachment-category-${audience}`} value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {CLINICAL_ATTACHMENT_CATEGORIES.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`clinical-attachment-description-${audience}`}>Descrição clínica (opcional)</Label>
                <Input id={`clinical-attachment-description-${audience}`} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="Identifique o documento sem incluir informações desnecessárias" />
              </div>
              <div className="md:col-span-2"><Button type="submit" disabled={!file || uploading}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}{uploading ? 'Enviando com segurança...' : 'Enviar documento'}</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      {state === 'loading' && <div role="status" className="flex items-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando documentos...</div>}
      {state === 'error' && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertDescription className="flex items-center justify-between gap-3">Não foi possível carregar os documentos.<Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></AlertDescription></Alert>}
      {state === 'success' && items.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><FileClock className="mx-auto mb-3 h-8 w-8" />Nenhum documento neste episódio.</div>}

      {state === 'success' && items.length > 0 && (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><FileCheck2 className="h-4 w-4 text-[#5f6f52]" /><p className="truncate font-semibold">{item.original_filename}</p><Badge variant={statusVariant(item.status)}>{item.status_label || CLINICAL_ATTACHMENT_STATUS_LABELS[item.status]}</Badge></div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.category_label} · {formatSize(item.size_bytes)} · {formatDate(item.clinical_date || item.created_at)}</p>
                  {item.description && <p className="mt-1 text-sm">{item.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(!patientAudience || item.can_open) && item.status !== 'quarantined' && <Button size="sm" variant="outline" onClick={() => openAttachment(item)}><Download className="mr-2 h-4 w-4" />Abrir</Button>}
                  {!patientAudience && item.status === 'pending_review' && <><Button size="sm" onClick={() => setAction({ type: 'accept', item })}>Validar</Button><Button size="sm" variant="outline" onClick={() => setAction({ type: 'reject', item })}>Recusar</Button></>}
                  {!patientAudience && item.status === 'active' && <><Button size="sm" variant="outline" onClick={() => setAction({ type: 'visibility', item, visibility: item.visibility === 'shared_with_patient' ? 'professional_private' : 'shared_with_patient' })}>{item.visibility === 'shared_with_patient' ? 'Tornar privado' : 'Compartilhar'}</Button><Button size="sm" variant="outline" onClick={() => setAction({ type: 'invalidate', item })}>Invalidar</Button></>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !acting) { setAction(null); setReason(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="uppercase">CONFIRMAR AÇÃO CLÍNICA</DialogTitle><DialogDescription>Esta ação será preservada no histórico de auditoria e não apagará o arquivo.</DialogDescription></DialogHeader>
          {requiresReason && <div className="space-y-2"><Label htmlFor="clinical-attachment-action-reason">Motivo (mínimo de 10 caracteres)</Label><Textarea id="clinical-attachment-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>}
          <DialogFooter><Button variant="outline" onClick={() => setAction(null)} disabled={acting}>Cancelar</Button><Button onClick={runAction} disabled={acting || (requiresReason && reason.trim().length < 10)}>{acting ? 'Registrando...' : 'Confirmar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
