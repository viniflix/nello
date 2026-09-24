import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { listAdminPeople } from '@/services/adminService';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true }));
    listAdminPeople({ search: query, type, page }).then(({ data, error }) => {
      if (active) setState({ loading: false, data, error });
    });
    return () => { active = false; };
  }, [query, type, page]);

  const data = state.data;
  return <div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Pessoas · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Cadastros</h1><p className="mt-2 text-sm text-muted-foreground">Diretório de nutricionistas e pacientes. Busca e paginação executadas no servidor.</p></div>
    <Card className="rounded-2xl"><CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" />{data ? `${data.total} pessoas` : 'Pessoas'}</CardTitle>
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar pessoas" placeholder="Nome ou email" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} className="pl-9 sm:w-64" /></div><select aria-label="Tipo de pessoa" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">Todos</option><option value="nutritionist">Nutricionistas</option><option value="patient">Pacientes</option></select></div>
    </CardHeader><CardContent className="space-y-3">
      {state.error && <p role="alert" className="text-sm text-destructive">Falha ao carregar pessoas. Atualize a página.</p>}
      {state.loading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />) : data?.items?.length ? data.items.map((person) => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-4">
        <div className="min-w-0"><p className="truncate font-medium">{person.name || 'Sem nome'}</p><p className="truncate text-xs text-muted-foreground">{person.email || 'Sem email'}</p></div>
        <div className="flex items-center gap-2"><Badge variant="outline">{person.user_type === 'nutritionist' ? 'Nutricionista' : 'Paciente'}</Badge><Badge variant={person.is_active === false ? 'secondary' : 'outline'}>{person.is_active === false ? 'Inativo' : 'Ativo'}</Badge>{person.user_type === 'nutritionist' && <Button asChild variant="outline" size="sm"><Link to={`/admin/users/${person.id}`}>Detalhes</Link></Button>}</div>
        <p className="w-full text-xs text-muted-foreground">Cadastro: {person.created_at ? new Date(person.created_at).toLocaleDateString('pt-BR') : '—'} · Última atividade: {person.last_seen_at ? new Date(person.last_seen_at).toLocaleDateString('pt-BR') : 'sem registro'}</p>
      </div>) : !state.error && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma pessoa encontrada neste filtro.</p>}
      <div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground"><span>Página {data?.page || page} · {data?.total ?? '—'} resultados</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Página anterior" disabled={state.loading || page <= 1} onClick={() => setPage((n) => n - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Próxima página" disabled={state.loading || page * 20 >= (data?.total || 0)} onClick={() => setPage((n) => n + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
    </CardContent></Card>
  </div>;
}
