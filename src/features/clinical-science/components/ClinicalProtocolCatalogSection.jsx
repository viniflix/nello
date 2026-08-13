import { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { listClinicalProtocols, recordClinicalProtocolDecision } from '../api/protocol-queries';

const DOMAIN = {
  anthropometry: 'ANTROPOMETRIA', energy: 'ENERGIA', laboratory: 'LABORATÓRIO',
  food_composition: 'COMPOSIÇÃO DE ALIMENTOS', meal_plan: 'PLANO ALIMENTAR',
};
const DECISION = { accepted: 'ACEITO', restricted: 'USO RESTRITO', rejected: 'NÃO UTILIZAR' };

export default function ClinicalProtocolCatalogSection() {
  const { toast } = useToast();
  const [protocols, setProtocols] = useState([]);
  const [state, setState] = useState('loading');
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState('accepted');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    const result = await listClinicalProtocols();
    setState(result.error ? 'error' : 'ready');
    if (!result.error) setProtocols(result.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = (protocol) => {
    setSelected(protocol);
    setDecision(protocol.professional_decision?.decision || 'accepted');
    setReason(protocol.professional_decision?.reason || 'Aplicabilidade avaliada para uso com julgamento clínico individual.');
  };
  const save = async () => {
    if (reason.trim().length < 10) return;
    setState('saving');
    const result = await recordClinicalProtocolDecision({ code: selected.code, version: selected.version, decision, reason: reason.trim() });
    if (result.error) {
      setState('ready');
      toast({ title: 'DECISÃO NÃO REGISTRADA', description: 'Confirme sua verificação profissional e tente novamente.', variant: 'destructive' });
      return;
    }
    setSelected(null);
    await load();
    toast({ title: 'DECISÃO CLÍNICA REGISTRADA', description: 'A decisão anterior foi preservada no histórico de auditoria.' });
  };

  if (state === 'loading') return <Card><CardContent className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" aria-label="Carregando protocolos" /></CardContent></Card>;
  if (state === 'error') return <Card><CardContent className="space-y-4 py-8 text-center"><p>Não foi possível carregar o catálogo científico.</p><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />TENTAR NOVAMENTE</Button></CardContent></Card>;

  return <div className="space-y-6">
    <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>DECISÃO FINAL DO PROFISSIONAL</AlertTitle><AlertDescription>O Nello apresenta origem, população e limitações. Você define a aplicabilidade de cada protocolo; nenhuma decisão clínica é automatizada.</AlertDescription></Alert>
    <div className="grid gap-4 lg:grid-cols-2">
      {protocols.map((protocol) => <Card key={`${protocol.code}-${protocol.version}`} className="flex flex-col">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline">{DOMAIN[protocol.domain] || protocol.domain}</Badge><Badge variant={protocol.professional_decision ? 'default' : 'secondary'}>{protocol.professional_decision ? DECISION[protocol.professional_decision.decision] : 'PENDENTE DE AVALIAÇÃO'}</Badge></div>
          <div><CardTitle className="text-lg uppercase">{protocol.name}</CardTitle><CardDescription className="mt-1">VERSÃO {protocol.version} · {protocol.source?.publisher}</CardDescription></div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <p className="text-sm">{protocol.description}</p>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>LIMITAÇÕES:</strong> {protocol.limitations}</div>
          <p className="text-xs text-muted-foreground">{protocol.source?.citation}</p>
          {protocol.professional_decision?.reason && <p className="text-sm"><strong>JUSTIFICATIVA ATUAL:</strong> {protocol.professional_decision.reason}</p>}
          <div className="mt-auto flex flex-wrap gap-2"><Button onClick={() => open(protocol)}><BookOpenCheck className="mr-2 h-4 w-4" />AVALIAR PROTOCOLO</Button>{protocol.source?.url && <Button variant="outline" asChild><a href={protocol.source.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />VER FONTE</a></Button>}</div>
        </CardContent>
      </Card>)}
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(null)}><DialogContent><DialogHeader><DialogTitle className="uppercase">AVALIAR {selected?.name}</DialogTitle><DialogDescription>Registre sua decisão profissional e o contexto. Alterações posteriores criarão um novo evento imutável.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>DECISÃO</Label><Select value={decision} onValueChange={setDecision}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accepted">ACEITO PARA USO</SelectItem><SelectItem value="restricted">USO RESTRITO</SelectItem><SelectItem value="rejected">NÃO UTILIZAR</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>JUSTIFICATIVA CLÍNICA</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Descreva aplicabilidade, restrições ou motivo da recusa." /><p className="text-xs text-muted-foreground">MÍNIMO DE 10 CARACTERES · {reason.length}/1000</p></div></div><DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>CANCELAR</Button><Button disabled={state === 'saving' || reason.trim().length < 10} onClick={() => void save()}>{state === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}REGISTRAR DECISÃO</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
