import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  Search,
  ArrowLeft,
  MoreVertical,
  Shield,
  ShieldCheck,
  Ban,
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getNutritionistsList } from '@/services/adminService';

export default function AdminUsersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [usersList, setUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Security check: Only admins can access
  const isAdmin = user?.profile?.is_admin === true;

  useEffect(() => {
    if (user && !isAdmin) {
      toast({
        title: 'Acesso Negado',
        description: 'Esta página é restrita a administradores.',
        variant: 'destructive'
      });
      navigate('/nutritionist', { replace: true });
      return;
    }

    if (isAdmin) {
      loadUsers();
    }
  }, [user, isAdmin, navigate, toast]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await getNutritionistsList();

      if (error) {
        console.error('[AdminUsersPage] Erro ao carregar usuários:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar a lista de nutricionistas.',
          variant: 'destructive'
        });
        return;
      }

      setUsersList(data || []);
    } catch (error) {
      console.error('[AdminUsersPage] Erro inesperado:', error);
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = usersList.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const formatDaysAgo = (dateString) => {
    if (!dateString) return 'Nunca';
    try {
      const date = new Date(dateString);
      const days = differenceInDays(new Date(), date);
      
      if (days === 0) return 'Hoje';
      if (days === 1) return 'Ontem';
      if (days < 7) return `Há ${days} dias`;
      return format(date, "dd MMM yyyy", { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  const handleAction = (action, user) => {
    toast({
      title: 'Ação Registrada',
      description: `Comando "${action}" executado para ${user.name} (Simulação)`,
    });
  };

  if (!user || !isAdmin) {
    return null; // Layout ou useEffect vai chutar pra fora.
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-12">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-6 pb-2 space-y-2">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/admin/dashboard')}
          className="text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar ao Dashboard
        </Button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gestão de Usuários</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie nutricionistas, visualize estatísticas de pacientes e engajamento.
            </p>
          </div>
          
          <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-lg border border-border">
            <div className="flex flex-col items-center px-4">
              <span className="text-2xl font-bold text-primary">{usersList.length}</span>
              <span className="text-xs text-muted-foreground">Nutricionistas</span>
            </div>
            <div className="w-px h-10 bg-border"></div>
            <div className="flex flex-col items-center px-4">
              <span className="text-2xl font-bold text-green-500">
                {usersList.reduce((acc, user) => acc + (user.patient_count || 0), 0)}
              </span>
              <span className="text-xs text-muted-foreground">Total Pacientes</span>
            </div>
          </div>
        </motion.div>

        {/* Table Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
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
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1); // reset to page 1 on search
                    }}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[300px]">Usuário</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-center">Pacientes</TableHead>
                      <TableHead>Cadastro / Último acesso</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-[150px]" /><Skeleton className="h-3 w-[100px]" /></div></div></TableCell>
                          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                          <TableCell className="text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                          <TableCell><div className="space-y-2"><Skeleton className="h-4 w-[100px]" /><Skeleton className="h-3 w-[80px]" /></div></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                          Nenhum nutricionista encontrado com "{searchQuery}"
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedUsers.map((user) => (
                        <TableRow key={user.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 border border-border">
                                <AvatarImage src={user.avatar_url} alt={user.name} />
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {user.name?.charAt(0).toUpperCase() || 'N'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium text-sm truncate" title={user.name}>
                                  {user.name || 'Sem nome'}
                                </span>
                                <span className="text-xs text-muted-foreground truncate" title={user.email}>
                                  {user.email}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-normal">
                              Ativo
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-semibold text-foreground">
                              {user.patient_count || 0}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col space-y-1">
                              <div className="flex items-center text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3 mr-1.5 opacity-70" />
                                {formatDaysAgo(user.created_at)}
                              </div>
                              <div className="flex items-center text-xs text-slate-500">
                                <Activity className="w-3 h-3 mr-1.5 opacity-70" />
                                {formatDaysAgo(user.last_sign_in_at || user.updated_at)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Abrir menu</span>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Ações da Conta</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleAction('Verificar Perfil', user)}>
                                  <ShieldCheck className="mr-2 h-4 w-4" />
                                  <span>Tornar Admin</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <a href={`mailto:${user.email}`} className="flex items-center w-full">
                                    <Activity className="mr-2 h-4 w-4" />
                                    <span>Enviar E-mail</span>
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleAction('Bloquear', user)}
                                  className="text-red-500 focus:text-red-500 focus:bg-red-500/10"
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  <span>Bloquear Acesso</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination controls */}
              {!isLoading && filteredUsers.length > 0 && (
                <div className="flex items-center justify-between mt-4 px-2">
                  <div className="text-xs text-muted-foreground">
                    Mostrando <span className="font-medium text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> de <span className="font-medium text-foreground">{filteredUsers.length}</span> usuários
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-8 px-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium px-2 text-foreground">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 px-2"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
