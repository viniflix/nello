import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { privacyTransitionError } from '@/features/privacy/model/requestTransition';
import { listPrivacyRequestsForAdmin, updatePrivacyRequest } from '@/features/privacy/api/privacy-queries';

const STATUSES = ['submitted', 'triaged', 'in_progress', 'fulfilled', 'rejected', 'cancelled'];
const STATUS = { submitted: 'RECEBIDA', triaged: 'EM TRIAGEM', in_progress: 'EM ATENDIMENTO', fulfilled: 'RESPONDIDA', rejected: 'RESPONDIDA COM RESTRIÇÃO', cancelled: 'CANCELADA' };
const TYPES = { access: 'ACESSO', portability: 'PORTABILIDADE', correction: 'CORREÇÃO', deletion: 'EXCLUSÃO/ANONIMIZAÇÃO', revocation: 'REVOGAÇÃO', objection: 'OPOSIÇÃO' };
const NEXT = { submitted: ['triaged', 'in_progress'], triaged: ['in_progress', 'fulfilled', 'rejected'], in_progress: ['fulfilled', 'rejected'] };
const RETENTION = [
  ['retain_legal_obligation', 'RETER POR OBRIGAÇÃO LEGAL'], ['anonymize', 'ANONIMIZAR'],
  ['delete_non_clinical', 'EXCLUIR SOMENTE DADOS NÃO CLÍNICOS'], ['no_deletion_applicable', 'EXCLUSÃO NÃO APLICÁVEL'],
];

export default function AdminPrivacyRequestsPage() {
  const { toast } = useToast();
  const generation = useRef(0);
  const confirmedFilter = useRef(null);
  const [loadError, setLoadError] = useState(false);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const [transition, setTransition] = useState(null);
  const [reason, setReason] = useState('');
  const [retentionDecision, setRetentionDecision] = useState('');
  const [legalBasis, setLegalBasis] = useState('');

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await listPrivacyRequestsForAdmin(filter || null);
    if (current !== generation.current) return;
    if (!error) { setItems(data || []); confirmedFilter.current = filter; }
    else { setLoadError(true); if (confirmedFilter.current !== filter) setItems([]); }
    setLoading(false);
    if (error) toast({ title: 'FILA NÃO CARREGADA', description: 'Tente atualizar novamente.', variant: 'destructive' });
  }, [filter, toast]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  const openTransition = (item, status) => {
    setTransition({ item, status });
    setReason(''); setRetentionDecision(item.retention_decision || ''); setLegalBasis(item.legal_basis || '');
  };
  const submitTransition = async () => {
    if (!transition || transitionError) return;
    setWorking(transition.item.id);
    const { error } = await updatePrivacyRequest({ requestId: transition.item.id, revision: transition.item.revision, status: transition.status, reason: reason.trim(), retentionDecision: retentionDecision || null, legalBasis: legalBasis.trim() || null });
    setWorking(null);
    if (error) {
      toast({ title: 'ATUALIZAÇÃO NÃO APLICADA', description: 'Recarregue a fila e revise justificativa, transição e retenção.', variant: 'destructive' });
      return;
    }
    setTransition(null);
    await load();
    toast({ title: 'SOLICITAÇÃO ATUALIZADA', description: 'O evento foi preservado na trilha administrativa.' });
  };
  const closing = ['fulfilled', 'rejected'].includes(transition?.status);
  const needsRetention = transition?.item.request_type === 'deletion' && ['in_progress', 'fulfilled', 'rejected'].includes(transition?.status);
  const transitionError = transition ? privacyTransitionError({ requestType: transition.item.request_type, status: transition.status, reason, retentionDecision, legalBasis }) : null;

  return <div className="space-y-6 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold uppercase"><ShieldCheck className="h-6 w-6" />PRIVACIDADE E LGPD</h1><p className="text-muted-foreground">Fila minimizada, prazos, decisões de retenção e trilha administrativa.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />ATUALIZAR</Button></div>
    <p className="rounded-lg border bg-muted/40 p-4 text-sm">Arquivar ou responder uma solicitação não apaga suas cópias. Prontuários e documentos clínicos permanecem sob guarda legal. Exclusões de dados não clínicos exigem verificação separada no banco, arquivos, telemetria, e-mails e backups.</p>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant={filter === '' ? 'default' : 'outline'} onClick={() => setFilter('')}>TODAS</Button>{STATUSES.map((status) => <Button key={status} size="sm" variant={filter === status ? 'default' : 'outline'} onClick={() => setFilter(status)}>{STATUS[status]}</Button>)}</div>
    {loadError && <p role="alert" className="rounded-lg border p-4 text-sm">Não foi possível confirmar esta fila. Atualize para tentar novamente.</p>}
    {loading ? <div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin" /></div> : loadError && items.length === 0 ? null : items.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">NENHUMA SOLICITAÇÃO NESTA FILA.</CardContent></Card> : <div className="grid gap-4">{items.map((item) => <Card key={item.id}><CardHeader><div className="flex flex-wrap justify-between gap-2"><CardTitle className="text-base uppercase">{item.subject_name} · {TYPES[item.request_type]}</CardTitle><Badge>{STATUS[item.status]}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><p>{item.subject_email}</p>{item.subject_note ? <p className="rounded-md bg-muted p-3">{item.subject_note}</p> : null}<p className="text-muted-foreground">PRAZO: {new Date(item.due_at).toLocaleDateString('pt-BR')} · REVISÃO {item.revision}</p>{item.resolution_summary ? <p><strong>RESPOSTA:</strong> {item.resolution_summary}</p> : null}<div className="flex flex-wrap gap-2">{(NEXT[item.status] || []).map((status) => <Button key={status} size="sm" variant="outline" disabled={working === item.id} onClick={() => openTransition(item, status)}>{STATUS[status]}</Button>)}</div></CardContent></Card>)}</div>}
    <Dialog open={Boolean(transition)} onOpenChange={(open) => !open && !working && setTransition(null)}><DialogContent><DialogHeader><DialogTitle>ATUALIZAR SOLICITAÇÃO</DialogTitle><DialogDescription>{TYPES[transition?.item.request_type]} · {STATUS[transition?.status]}</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="privacy-reason">JUSTIFICATIVA/RESPOSTA AO TITULAR</Label><Textarea id="privacy-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} /><p className="text-xs text-muted-foreground">MÍNIMO DE 10 CARACTERES · {reason.length}/2000</p></div>{needsRetention && <div className="space-y-2"><Label>DECISÃO DE RETENÇÃO</Label><Select value={retentionDecision} onValueChange={setRetentionDecision}><SelectTrigger><SelectValue placeholder="SELECIONE" /></SelectTrigger><SelectContent>{RETENTION.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><Label htmlFor="legal-basis">BASE LEGAL/OBSERVAÇÃO {closing || (needsRetention && retentionDecision) ? '(OBRIGATÓRIA)' : '(OPCIONAL)'}</Label><Textarea id="legal-basis" value={legalBasis} onChange={(event) => setLegalBasis(event.target.value)} maxLength={1000} /></div>{transitionError && <p role="status" className="text-sm text-muted-foreground">{transitionError}</p>}</div><DialogFooter><Button variant="outline" disabled={Boolean(working)} onClick={() => setTransition(null)}>CANCELAR</Button><Button disabled={Boolean(working || transitionError)} onClick={() => void submitTransition()}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}REGISTRAR ETAPA</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
