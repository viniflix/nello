import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users, Search, Calendar, Activity, ChevronLeft, ChevronRight,
  ChevronRight as Chevron, Mail
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getNutritionistsList } from '@/services/adminService';

const formatDate = (dateString) => {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    const days = differenceInDays(new Date(), date);
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    if (days < 7) return `Há ${days} dias`;
    return format(date, 'dd MMM yyyy', { locale: ptBR });
  } catch {
    return '—';
  }
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [usersList, setUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isAdmin = user?.profile?.is_admin === true;

  useEffect(() => {
    if (user && !isAdmin) {
      toast({ title: 'Acesso Negado', description: 'Página restrita a administradores.', variant: 'destructive' });
      navigate('/nutritionist', { replace: true });
      return;
    }
    if (isAdmin) loadUsers();
  }, [user, isAdmin, navigate, toast]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await getNutritionistsList();
      if (error) throw error;
      setUsersList(data || []);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível carregar a lista.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = usersList.filter(u =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPatients = usersList.reduce((acc, u) => acc + (u.patients_count || 0), 0);

  if (!user || !isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Usuários</h1>
          <p className="text-muted-foreground mt-1">Nutricionistas cadastrados e seus pacientes vinculados.</p>
        </div>

        <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-lg border border-border">
          <div className="flex flex-col items-center px-4">
            <span className="text-2xl font-bold text-primary">{isLoading ? '—' : usersList.length}</span>
            <span className="text-xs text-muted-foreground">Nutricionistas</span>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="flex flex-col items-center px-4">
            <span className="text-2xl font-bold text-emerald-500">{isLoading ? '—' : totalPatients}</span>
            <span className="text-xs text-muted-foreground">Total Pacientes</span>
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Lista de Profissionais
              </CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  className="pl-9 h-9"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[280px]">Profissional</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-center">Pacientes</TableHead>
                    <TableHead>Cadastro / Último acesso</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-[140px]" /><Skeleton className="h-3 w-[100px]" /></div></div></TableCell>
                        <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                        <TableCell className="text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                        <TableCell><div className="space-y-2"><Skeleton className="h-3 w-[90px]" /><Skeleton className="h-3 w-[80px]" /></div></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-12 ml-auto rounded-md" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        {searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum nutricionista cadastrado.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedUsers.map((u) => (
                      <TableRow
                        key={u.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigate(`/admin/users/${u.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border border-border">
                              <AvatarImage src={u.avatar_url} alt={u.name} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {u.name?.charAt(0).toUpperCase() || 'N'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-sm truncate">{u.name || 'Sem nome'}</span>
                              <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                <Mail className="w-3 h-3" />{u.email}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={u.is_active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground'}>
                            {u.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-semibold text-foreground">{u.patients_count ?? 0}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3 mr-1.5 opacity-70" />
                              {formatDate(u.created_at)}
                            </div>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Activity className="w-3 h-3 mr-1.5 opacity-70" />
                              {u.last_activity ? formatDate(u.last_activity) : 'Sem registro'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={(e) => { e.stopPropagation(); navigate(`/admin/users/${u.id}`); }}
                          >
                            Ver perfil
                            <Chevron className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {!isLoading && filteredUsers.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4 px-2">
                <div className="text-xs text-muted-foreground">
                  Mostrando <span className="font-medium text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> de <span className="font-medium text-foreground">{filteredUsers.length}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 px-2">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium px-2">Pág. {currentPage} de {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 px-2">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
