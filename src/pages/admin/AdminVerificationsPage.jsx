import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import VerificationReviewDialog from '@/components/admin/VerificationReviewDialog';
import { listProfessionalVerifications } from '@/services/adminService';

const STATUS_LABELS = { pending: 'Em análise', needs_information: 'Complementação', approved: 'Aprovado', rejected: 'Reprovado', expired: 'Expirado', suspended: 'Suspenso' };

export default function AdminVerificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listProfessionalVerifications({ status: status === 'all' ? null : status, role: role === 'all' ? null : role });
    setItems(data || []);
    setLoading(false);
  }, [status, role]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div><h1 className="text-3xl font-bold">Verificações profissionais</h1><p className="text-sm text-muted-foreground">Consulta assistida, decisões justificadas e histórico auditável.</p></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck /> Fila de análise</CardTitle><CardDescription>{items.length} solicitação(ões) no filtro atual.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todos os estados</SelectItem>{Object.entries(STATUS_LABELS).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
            <Select value={role} onValueChange={setRole}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todos os perfis</SelectItem><SelectItem value="nutritionist">Nutricionistas</SelectItem><SelectItem value="student">Estudantes</SelectItem></SelectGroup></SelectContent></Select>
          </div>
          <div className="rounded-md border">
            <Table><TableHeader><TableRow><TableHead>Profissional</TableHead><TableHead>Perfil</TableHead><TableHead>Estado</TableHead><TableHead>Dados</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>
              {loading ? <TableRow><TableCell colSpan={5} className="text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow> : items.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma verificação encontrada.</TableCell></TableRow> : items.map(item => <TableRow key={item.id}><TableCell><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.email}</div></TableCell><TableCell>{item.professional_role === 'student' ? 'Estudante' : 'Nutricionista'}</TableCell><TableCell><Badge variant={item.status === 'approved' ? 'success' : item.status === 'suspended' || item.status === 'rejected' ? 'destructive' : 'secondary'}>{STATUS_LABELS[item.status] || item.status}</Badge></TableCell><TableCell>{item.professional_role === 'student' ? item.institution_name : `CRN ${item.crn_region || '—'} ${item.crn_number || '—'}`}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelected(item)}>Analisar</Button></TableCell></TableRow>)}
            </TableBody></Table>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ExternalLink /> A consulta ao CFN/CRN permanece manual e assistida; nenhuma página oficial é raspada automaticamente.</p>
        </CardContent>
      </Card>
      <VerificationReviewDialog verification={selected} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} onCompleted={load} />
    </div>
  );
}
