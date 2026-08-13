import { useCallback, useEffect, useState } from 'react';
import { Clock3, Loader2, Send, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cancelMyPrivacyRequest, createMyPrivacyRequest, listMyPrivacyRequests } from '../api/privacy-queries';

const REQUEST_TYPES = [
  ['access', 'Acesso aos dados'], ['portability', 'Portabilidade assistida'], ['correction', 'Correção de dados'],
  ['deletion', 'Exclusão ou anonimização'], ['revocation', 'Revogação de consentimento'], ['objection', 'Oposição a tratamento'],
];
const STATUS = { submitted: 'Recebida', triaged: 'Em triagem', in_progress: 'Em atendimento', fulfilled: 'Concluída', rejected: 'Respondida com restrição', cancelled: 'Cancelada' };

export default function PatientPrivacyRequests() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [type, setType] = useState('access');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const load = useCallback(async () => {
    const { data } = await listMyPrivacyRequests();
    setItems(data || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    setWorking(true);
    const { error } = await createMyPrivacyRequest(type, note.trim());
    setWorking(false);
    if (error) {
      toast({ title: 'Solicitação não criada', description: error.message?.includes('already_exists') ? 'Já existe uma solicitação ativa deste tipo.' : 'Revise os dados e tente novamente.', variant: 'destructive' });
      return;
    }
    setNote('');
    await load();
    toast({ title: 'Solicitação registrada', description: 'Você pode acompanhar cada etapa nesta tela.' });
  };

  const cancel = async (id) => {
    const { error } = await cancelMyPrivacyRequest(id);
    if (!error) await load();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg uppercase">Solicitações de privacidade</CardTitle><CardDescription>Peça correção, acesso, oposição ou exclusão. Dados clínicos sujeitos a guarda legal não são apagados automaticamente.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[260px_1fr_auto] md:items-end">
          <div className="space-y-2"><Label htmlFor="privacy-type">Tipo</Label><select id="privacy-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}>{REQUEST_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="privacy-note">Detalhes essenciais (opcional)</Label><textarea id="privacy-note" maxLength={1000} rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Informe somente o necessário para localizar ou corrigir os dados." /></div>
          <Button onClick={() => void submit()} disabled={working}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar</Button>
        </div>
        <div className="space-y-3">
          {items.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma solicitação registrada.</p> : items.map((item) => (
            <div key={item.id} className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{REQUEST_TYPES.find(([value]) => value === item.request_type)?.[1]}</Badge><Badge variant="outline">{STATUS[item.status]}</Badge></div><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />Prazo operacional: {new Date(item.due_at).toLocaleDateString('pt-BR')}</p>{item.resolution_summary ? <p className="mt-2 text-sm">{item.resolution_summary}</p> : null}</div>
              {['submitted', 'triaged'].includes(item.status) ? <Button variant="ghost" size="sm" onClick={() => void cancel(item.id)}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
