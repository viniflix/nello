import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Award, Trophy, Target, Flame, Star, TrendingUp, Lock, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { Alert, AlertDescription } from '@/components/ui/alert';

const ICON_MAP = {
  trophy: Trophy,
  award: Award,
  target: Target,
  flame: Flame,
  star: Star,
  trending_up: TrendingUp,
};

function formatCriteria(criteria) {
  if (!criteria) return 'Critério não disponível';
  try {
    const parsed = typeof criteria === 'string' ? JSON.parse(criteria) : criteria;
    if (parsed.type === 'meals_logged') return `Registre ${parsed.count} refeições`;
    if (parsed.type === 'days_streak') return `Mantenha ${parsed.days} dias consecutivos de registro`;
    if (parsed.type === 'calories_goal_met') return `Atinja sua meta calórica ${parsed.times} vezes`;
    if (parsed.type === 'protein_goal_met') return `Atinja sua meta de proteína ${parsed.times} vezes`;
    return 'Complete o desafio';
  } catch {
    return 'Critério não disponível';
  }
}

export default function NutritionistPatientAchievementsPage() {
  const { patientId, loading: resolveLoading, error: resolveError, paramValue } = useResolvedPatientId();
  const navigate = useNavigate();
  const [patientData, setPatientData] = useState(null);
  const [allAchievements, setAllAchievements] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState(new Set());
  const [achievementDates, setAchievementDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, unlocked: 0 });

  useEffect(() => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    const fetch = async () => {
      setLoading(true);
      const patient = { id: patientId, slug: paramValue };
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('name')
          .eq('id', patientId)
          .maybeSingle();
        setPatientData(profile ? { ...patient, full_name: profile.name } : patient);
      } catch (e) {
        setPatientData(patient);
      }

      const { data: achievementsData, error: achievementsError } = await supabase
        .from('achievements')
        .select('*')
        .order('id', { ascending: true });

      if (!achievementsError) {
        setAllAchievements(achievementsData || []);
        setStats(prev => ({ ...prev, total: achievementsData?.length || 0 }));
      }

      const { data: unlockedData, error: unlockedError } = await supabase
        .from('user_achievements')
        .select('achievement_id, achieved_at')
        .eq('user_id', patientId);

      if (!unlockedError) {
        const unlockedSet = new Set(unlockedData?.map(a => a.achievement_id) || []);
        const datesMap = {};
        unlockedData?.forEach(a => { datesMap[a.achievement_id] = a.achieved_at; });
        setUnlockedIds(unlockedSet);
        setAchievementDates(datesMap);
        setStats(prev => ({ ...prev, unlocked: unlockedSet.size }));
      }
      setLoading(false);
    };
    fetch();
  }, [patientId, paramValue]);

  const getIcon = (iconName) => ICON_MAP[iconName] || Award;

  if (resolveLoading || !patientId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (resolveError) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <Alert variant="destructive">
          <AlertDescription>Paciente não encontrado.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const progressPercentage = stats.total > 0 ? Math.round((stats.unlocked / stats.total) * 100) : 0;
  const patient = patientData || { id: patientId, slug: paramValue };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-6">
        <Button
          variant="ghost"
          className="mb-4 gap-2 -ml-2"
          onClick={() => navigate(patientRoute(patient, 'hub'))}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Hub
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-primary mb-2">
              Conquistas de {patientData?.full_name || 'Paciente'}
            </h1>
            <p className="text-muted-foreground">
              Conquistas desbloqueadas pelo paciente na plataforma
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-yellow-600" />
                  Progresso
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {stats.unlocked} / {stats.total}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Conquistas desbloqueadas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-yellow-600">
                      {progressPercentage}%
                    </p>
                  </div>
                </div>
                <Progress value={progressPercentage} className="h-2 bg-yellow-200" indicatorClassName="bg-yellow-500" />
              </CardContent>
            </Card>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allAchievements.map((achievement, index) => {
                const isUnlocked = unlockedIds.has(achievement.id);
                const Icon = getIcon(achievement.icon_name);
                const achievedDate = achievementDates[achievement.id];

                return (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                  >
                    <Card
                      className={`h-full transition-all ${
                        isUnlocked
                          ? 'border-yellow-300 shadow-md hover:shadow-lg'
                          : 'opacity-50 grayscale hover:opacity-70'
                      }`}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <div
                              className={`p-3 rounded-full flex-shrink-0 ${
                                isUnlocked ? 'bg-yellow-500' : 'bg-gray-400'
                              }`}
                            >
                              {isUnlocked ? (
                                <Icon className="w-6 h-6 text-white" />
                              ) : (
                                <Lock className="w-6 h-6 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-lg mb-1">{achievement.name}</CardTitle>
                              <p className="text-sm text-muted-foreground">{achievement.description}</p>
                            </div>
                          </div>
                          {isUnlocked && (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex-shrink-0">
                              Desbloqueada
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {!isUnlocked && (
                          <div className="pt-2 border-t border-border">
                            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Objetivo</p>
                            <p className="text-sm text-foreground">{formatCriteria(achievement.criteria)}</p>
                          </div>
                        )}
                        {isUnlocked && achievedDate && (
                          <div className="pt-2 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                              Desbloqueada em {format(new Date(achievedDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {!loading && allAchievements.length === 0 && (
            <div className="text-center py-12">
              <Award className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-lg text-muted-foreground">
                Nenhuma conquista disponível no momento
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
