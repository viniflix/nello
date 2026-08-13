import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Edit,
  Trophy,
  ClipboardList,
  LogOut,
  ChevronRight,
  Award,
  Shield,
  Phone,
  Calendar,
  Ruler,
  Weight,
  MapPin,
  BookOpen,
  UserMinus
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import AvatarUpload from '@/components/patient/AvatarUpload';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { endMyCareRelationship, getMyCareRelationship } from '@/lib/supabase/patient-queries';
import DataPortabilitySection from '@/features/data-portability/components/DataPortabilitySection';
import PatientPrivacyRequests from '@/features/privacy/components/PatientPrivacyRequests';

/**
 * PatientProfilePage - Aba 5: Perfil
 *
 * Funcionalidades:
 * - Visualização de dados pessoais
 * - Links para Conquistas, Questionários, Banco de Alimentos
 * - Opções de LGPD (exportar dados, excluir conta)
 * - Logout
 */
export default function PatientProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [careRelationship, setCareRelationship] = useState(null);
  const [endingCare, setEndingCare] = useState(false);

  const loadUserAchievements = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('user_achievements')
      .select('*, achievements(name, description, icon_name)')
      .eq('user_id', user.id);

    if (error) {
      console.error('Erro ao carregar conquistas:', error);
      setAchievements([]);
    } else {
      setAchievements(data || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadUserAchievements();
  }, [loadUserAchievements]);

  useEffect(() => {
    getMyCareRelationship().then(({ data }) => setCareRelationship(data));
  }, []);

  const handleEndCare = async () => {
    setEndingCare(true);
    const { success, error } = await endMyCareRelationship(user.id);
    setEndingCare(false);
    if (!success) {
      toast({
        title: 'Não foi possível encerrar o acompanhamento',
        description: error?.message || 'Tente novamente.',
        variant: 'destructive'
      });
      return;
    }
    setCareRelationship(previous => ({ ...previous, status: 'ended', ended_at: new Date().toISOString() }));
    toast({
      title: 'Acompanhamento encerrado',
      description: 'O nutricionista foi avisado e seu histórico continua preservado.'
    });
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: 'Logout realizado',
        description: 'Até logo!'
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível fazer logout.',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="mb-2 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Perfil</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie sua conta e preferências
            </p>
          </div>
          <ThemeToggle />
        </div>
        {/* Seção: Meus Dados */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Meus Dados</CardTitle>
              <CardDescription>Informações da sua conta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Foto de Perfil */}
              <div className="flex justify-center py-4">
                <AvatarUpload size="large" showChangeButton={true} />
              </div>

              <hr className="border-t" />

              {/* Grid de Informações */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Nome completo</p>
                    <p className="text-sm font-medium text-foreground truncate">
                      {user?.profile?.name || 'Não informado'}
                    </p>
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Email</p>
                    <p className="text-sm font-medium text-foreground truncate">
                      {user?.email || 'Não informado'}
                    </p>
                  </div>
                </div>

                {/* Telefone */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Telefone</p>
                    <p className="text-sm font-medium text-foreground">
                      {user?.profile?.phone || 'Não informado'}
                    </p>
                  </div>
                </div>

                {/* Data de Nascimento */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Data de Nascimento</p>
                    <p className="text-sm font-medium text-foreground">
                      {user?.profile?.birth_date
                        ? format(new Date(user?.profile?.birth_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : 'Não informado'
                      }
                    </p>
                  </div>
                </div>

                {/* Altura */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Ruler className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Altura</p>
                    <p className="text-sm font-medium text-foreground">
                      {user?.profile?.height
                        ? `${user?.profile?.height} cm`
                        : 'Não informado'
                      }
                    </p>
                  </div>
                </div>

                {/* Peso Atual */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Weight className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Peso</p>
                    <p className="text-sm font-medium text-foreground">
                      {user?.profile?.weight
                        ? `${user?.profile?.weight} kg`
                        : 'Não informado'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Seção de Endereço (se existir) */}
              {(user?.profile?.address?.zipcode || user?.profile?.address?.city) && (
                <>
                  <hr className="border-t" />

                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">Endereço</h4>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {[
                            user?.profile?.address?.street && user?.profile?.address?.number
                              ? `${user?.profile?.address?.street}, ${user?.profile?.address?.number}`
                              : user?.profile?.address?.street || '',
                            user?.profile?.address?.complement || '',
                            user?.profile?.address?.neighborhood || '',
                            user?.profile?.address?.city && user?.profile?.address?.state
                              ? `${user?.profile?.address?.city} - ${user?.profile?.address?.state}`
                              : user?.profile?.address?.city || user?.profile?.address?.state || '',
                            user?.profile?.address?.zipcode
                              ? `CEP: ${user?.profile?.address?.zipcode}`
                              : ''
                          ].filter(Boolean).join(', ') || 'Endereço não informado'}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <hr className="border-t" />

              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => navigate('/patient/editar-perfil')}
              >
                <span className="flex items-center gap-2">
                  <Edit className="w-4 h-4" />
                  Editar Informações
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Seção: Minha Jornada */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Minha Jornada</CardTitle>
              <CardDescription>Recursos e acompanhamento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Minhas Conquistas */}
              <Button
                variant="ghost"
                className="w-full justify-between h-auto py-3"
                onClick={() => navigate('/patient/conquistas')}
              >
                <span className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Minhas Conquistas</p>
                    <p className="text-xs text-muted-foreground">
                      {achievements.length} conquista(s) desbloqueada(s)
                    </p>
                  </div>
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>

              <hr className="border-t" />

              {/* Meus Questionários */}
              <Button
                variant="ghost"
                className="w-full justify-between h-auto py-3"
                onClick={() => {
                  // Try to navigate, show toast if route doesn't exist
                  try {
                    navigate('/patient/questionnaires');
                  } catch {
                    toast({
                      title: 'Em breve',
                      description: 'Esta funcionalidade estará disponível em breve.'
                    });
                  }
                }}
              >
                <span className="flex items-center gap-3">
                  <ClipboardList className="w-5 h-5 text-blue-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Meus Questionários</p>
                    <p className="text-xs text-muted-foreground">
                      Visualize e atualize suas respostas
                    </p>
                  </div>
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>

              <hr className="border-t" />

              {/* Receitas do Nutri */}
              <Button
                variant="ghost"
                className="w-full justify-between h-auto py-3"
                onClick={() => {
                  // Show "coming soon" toast for now
                  toast({
                    title: 'Em breve',
                    description: 'Receitas do Nutri estará disponível em breve.'
                  });
                  // Future: navigate('/patient/recipes');
                }}
              >
                <span className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-orange-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Receitas do Nutri</p>
                    <p className="text-xs text-muted-foreground">
                      Receitas personalizadas do seu nutricionista
                    </p>
                  </div>
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <DataPortabilitySection />
        <PatientPrivacyRequests />

        {/* Seção: Privacidade */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Privacidade</CardTitle>
              </div>
              <CardDescription>Gerencie seus dados pessoais</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {careRelationship?.status === 'active' && (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between h-auto py-3 text-destructive hover:text-destructive"
                      >
                        <span className="flex items-center gap-3">
                          <UserMinus className="w-5 h-5" />
                          <div className="text-left">
                            <p className="text-sm font-medium">Encerrar acompanhamento</p>
                            <p className="text-xs text-muted-foreground">
                              Desvincular de {careRelationship.nutritionist_name || 'seu nutricionista'}
                            </p>
                          </div>
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Encerrar acompanhamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A decisão é imediata e não depende de aprovação. O nutricionista será avisado,
                          o histórico será preservado e você poderá aceitar um novo convite depois.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleEndCare} disabled={endingCare}>
                          {endingCare ? 'Encerrando...' : 'Confirmar encerramento'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <hr className="border-t" />
                </>
              )}

            </CardContent>
          </Card>
        </motion.div>

        {/* Botão de Logout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive border-destructive/30"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair da Conta
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
