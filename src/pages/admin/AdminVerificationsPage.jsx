import React, { useState } from 'react';
import { ExternalLink, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import VerificationReviewDialog from '@/components/admin/VerificationReviewDialog';
import { getAdminVerificationQueue } from '@/services/adminService';
import { useAdminSource } from '@/portals/admin/hooks/useAdminSource';
import AdminSourceStatus from '@/portals/admin/components/AdminSourceStatus';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_LABELS = { not_submitted: 'Não enviado', pending: 'Em análise', needs_information: 'Complementação', approved: 'Aprovado', rejected: 'Reprovado', expired: 'Expirado', suspended: 'Suspenso' };

export default function AdminVerificationsPage() {
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);

  const query = useAdminSource(['verifications', status, role, page], () => getAdminVerificationQueue({ status: status === 'all' ? null : status, role: role === 'all' ? null : role, page }));
  const items = query.data?.items || [];
  const selected = items.find(item => item.id === selectedId) || null;
  const loading = query.isPending && !query.data;

  return (
    <div className="flex flex-col gap-6">
      <div><h1 className="text-3xl font-bold">Verificações profissionais</h1><p className="text-sm text-muted-foreground">Consulta assistida, decisões justificadas e histórico auditável.</p></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 tracking-normal [word-spacing:.08em]"><ShieldCheck /> Fila de análise</CardTitle><CardDescription>{query.data ? `${query.data.total} solicitações no filtro atual · até 20 por página` : 'Consultando solicitações'}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AdminSourceStatus query={query} queryOnly />
          <div className="flex flex-wrap gap-3">
            <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); setSelectedId(null); }}><SelectTrigger aria-label="Filtrar verificações" className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todos os estados</SelectItem>{Object.entries(STATUS_LABELS).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
            <Select value={role} onValueChange={(value) => { setRole(value); setPage(1); setSelectedId(null); }}><SelectTrigger aria-label="Filtrar por perfil" className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todos os perfis</SelectItem><SelectItem value="nutritionist">Nutricionistas</SelectItem><SelectItem value="student">Estudantes</SelectItem></SelectGroup></SelectContent></Select>
          </div>
          <div className="rounded-md border">
            <Table aria-label="Verificações profissionais" mobileLabels={["Profissional", "Perfil", "Estado", "Dados", "Ação"]}><TableHeader><TableRow><TableHead>Profissional</TableHead><TableHead>Perfil</TableHead><TableHead>Estado</TableHead><TableHead>Dados</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>
              {loading ? <TableRow><TableCell colSpan={5}><div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div></TableCell></TableRow> : items.length === 0 && !query.isError ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma verificação encontrada.</TableCell></TableRow> : items.map(item => <TableRow key={item.id}><TableCell><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.email}</div></TableCell><TableCell>{item.professional_role === 'student' ? 'Estudante' : 'Nutricionista'}</TableCell><TableCell><Badge variant={item.status === 'approved' ? 'success' : item.status === 'suspended' || item.status === 'rejected' ? 'destructive' : 'secondary'}>{STATUS_LABELS[item.status] || item.status}</Badge></TableCell><TableCell>{item.professional_role === 'student' ? item.institution_name : `CRN ${item.crn_region || '—'} ${item.crn_number || '—'}`}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedId(item.id)}>{query.data?.can_write && ['pending','approved'].includes(item.status) ? 'Analisar' : 'Consultar'}</Button></TableCell></TableRow>)}
            </TableBody></Table>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm"><span>Página {page}</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Página anterior" disabled={query.isFetching || page <= 1} onClick={() => { setSelectedId(null); setPage(n => n - 1); }}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Próxima página" disabled={query.isFetching || !query.data || page * 20 >= query.data.total} onClick={() => { setSelectedId(null); setPage(n => n + 1); }}><ChevronRight className="h-4 w-4" /></Button></div></div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ExternalLink /> A consulta ao CFN/CRN permanece manual e assistida; nenhuma página oficial é raspada automaticamente.</p>
        </CardContent>
      </Card>
      <VerificationReviewDialog verification={selected} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }} onCompleted={() => void query.refetch()} canWrite={query.data?.can_write === true} />
    </div>
  );
}
