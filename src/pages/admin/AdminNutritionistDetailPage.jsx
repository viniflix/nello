import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, User, Mail, Phone, BookOpen, Award,
  Users, Calendar, Activity, Clock, MapPin, ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';

const formatAge = (dateStr) => {
  if (!dateStr) return null;
  try {
    const days = differenceInDays(new Date(), new Date(dateStr));
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    if (days < 7) return `${days} dias atrás`;
    if (days < 30) return `${Math.floor(days / 7)} sem. atrás`;
    if (days < 365) return `${Math.floor(days / 30)} meses atrás`;
    return format(new Date(dateStr), 'dd/MM/yyyy');
  } catch {
    return '—';
  }
};

const goalLabels = {
  weight_loss: 'Perda de peso',
  muscle_gain: 'Ganho muscular',
  maintenance: 'Manutenção',
  health: 'Saúde geral',
};

export default function AdminNutritionistDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setIsLoading(true);
      const { data: result, error } = await supabase.rpc('get_nutritionist_detail', {
        p_nutritionist_id: id,
      });
      if (!error && result) setData(result);
      setIsLoading(false);
    };
    load();
  }, [id]);

  if (!user?.profile?.is_admin) return null;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/admin/users')}
        className="text-muted-foreground hover:text-foreground -ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Voltar à Lista
      </Button>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <User className="w-12 h-12 mb-3 opacity-40" />
          <p>Nutricionista não encontrado.</p>
        </div>
      ) : (
        <>
          {/* Profile Card */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  <Avatar className="w-20 h-20 border-4 border-indigo-100 shrink-0">
                    <AvatarImage src={data.avatar_url} alt={data.name} />
                    <AvatarFallback className="text-2xl bg-indigo-100 text-indigo-700">
                      {data.name?.charAt(0) || 'N'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-bold text-foreground">{data.name}</h1>
                      {data.is_admin && (
                        <Badge className="bg-indigo-100 text-indigo-700 border-0">Admin</Badge>
                      )}
                      <Badge variant={data.is_active ? 'default' : 'secondary'} className="text-xs">
                        {data.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                      {data.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> {data.email}
                        </span>
                      )}
                      {data.phone && (
                        <span className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" /> {data.phone}
                        </span>
                      )}
                      {data.crn && (
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> CRN: {data.crn}
                        </span>
                      )}
                      {data.education && (
                        <span className="flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5" /> {data.education}
                        </span>
                      )}
                    </div>

                    {data.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{data.bio}</p>
                    )}

                    {Array.isArray(data.specialties) && data.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {data.specialties.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs font-normal">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 shrink-0">
                    <div className="flex flex-col items-center text-center bg-muted/40 rounded-lg px-5 py-3 min-w-[80px]">
                      <span className="text-2xl font-bold text-indigo-600">{data.patients_count ?? 0}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">Pacientes</span>
                    </div>
                    <div className="flex flex-col items-center text-center bg-muted/40 rounded-lg px-5 py-3 min-w-[80px]">
                      <span className="text-2xl font-bold text-emerald-600">{data.new_patients_30d ?? 0}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">Novos (30d)</span>
                    </div>
                  </div>
                </div>

                {/* Meta Footer */}
                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Cadastro: {data.created_at ? format(new Date(data.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR }) : '—'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Último acesso: {formatAge(data.last_sign_in_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Patients Table */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <CardTitle>Pacientes Vinculados</CardTitle>
                </div>
                <CardDescription>
                  {data.patients_count ?? 0} paciente{data.patients_count !== 1 ? 's' : ''} vinculado{data.patients_count !== 1 ? 's' : ''} a {data.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!data.patients || data.patients.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <Users className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum paciente vinculado ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.patients.map((patient) => (
                      <div
                        key={patient.id}
                        className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={patient.avatar_url} alt={patient.name} />
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {patient.name?.charAt(0) || 'P'}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-sm truncate">{patient.name || 'Sem nome'}</p>
                            {patient.goal && (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {goalLabels[patient.goal] || patient.goal}
                              </Badge>
                            )}
                            {!patient.is_active && (
                              <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{patient.email}</p>
                        </div>

                        <div className="text-right shrink-0 hidden sm:block">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                            <Calendar className="w-3 h-3" />
                            <span>{formatAge(patient.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end mt-0.5">
                            <Activity className="w-3 h-3" />
                            <span>{patient.last_sign_in_at ? formatAge(patient.last_sign_in_at) : 'Nunca'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}
