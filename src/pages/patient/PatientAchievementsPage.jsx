import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Award, Trophy, Target, Flame, Star, TrendingUp, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Mapeamento de ícones de conquistas
 */
const ICON_MAP = {
  trophy: Trophy,
  award: Award,
  target: Target,
  flame: Flame,
  star: Star,
  trending_up: TrendingUp,
};

/**
 * Formata o critério da conquista em texto legível
 */
function formatCriteria(criteria) {
  if (!criteria) return 'Critério não disponível';

  try {
    const parsedCriteria = typeof criteria === 'string' ? JSON.parse(criteria) : criteria;

    if (parsedCriteria.type === 'meals_logged') {
      return `Registre ${parsedCriteria.count} refeições`;
    }
    if (parsedCriteria.type === 'days_streak') {
      return `Mantenha ${parsedCriteria.days} dias consecutivos de registro`;
    }
    if (parsedCriteria.type === 'calories_goal_met') {
      return `Atinja sua meta calórica ${parsedCriteria.times} vezes`;
    }
    if (parsedCriteria.type === 'protein_goal_met') {
      return `Atinja sua meta de proteína ${parsedCriteria.times} vezes`;
    }

    return 'Complete o desafio';
  } catch (e) {
    return 'Critério não disponível';
  }
}

/**
 * PatientAchievementsPage - Página completa de conquistas com gamificação
 */
export default function PatientAchievementsPage() {
  const { user } = useAuth();
  const [allAchievements, setAllAchievements] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState(new Set());
  const [achievementDates, setAchievementDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, unlocked: 0 });

  useEffect(() => {
    const fetchAchievements = async () => {
      if (!user) return;

      setLoading(true);

      // Query 1: Buscar todas as conquistas
      const { data: achievementsData, error: achievementsError } = await supabase
        .from('achievements')
        .select('*')
        .order('id', { ascending: true });

      if (achievementsError) {
        console.error('Erro ao buscar conquistas:', achievementsError);
      } else {
        setAllAchievements(achievementsData || []);
        setStats(prev => ({ ...prev, total: achievementsData?.length || 0 }));
      }

      // Query 2: Buscar conquistas desbloqueadas pelo usuário
      const { data: unlockedData, error: unlockedError } = await supabase
        .from('user_achievements')
        .select('achievement_id, achieved_at')
        .eq('user_id', user.id);

      if (unlockedError) {
        console.error('Erro ao buscar conquistas desbloqueadas:', unlockedError);
      } else {
        const unlockedSet = new Set(unlockedData?.map(a => a.achievement_id) || []);
        const datesMap = {};
        unlockedData?.forEach(a => {
          datesMap[a.achievement_id] = a.achieved_at;
        });

        setUnlockedIds(unlockedSet);
        setAchievementDates(datesMap);
        setStats(prev => ({ ...prev, unlocked: unlockedSet.size }));
      }

      setLoading(false);
    };

    fetchAchievements();
  }, [user]);

  const getIcon = (iconName) => {
    const Icon = ICON_MAP[iconName] || Award;
    return Icon;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const progressPercentage = stats.total > 0 ? Math.round((stats.unlocked / stats.total) * 100) : 0;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Minhas Conquistas</h1>
          <p className="text-muted-foreground">
            Acompanhe seu progresso e desbloqueie conquistas especiais
          </p>
        </div>

        {/* Card de Progresso Geral */}
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
                Progresso Geral
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

        {/* Grid de Conquistas */}
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
                            isUnlocked
                              ? 'bg-yellow-500'
                              : 'bg-gray-400'
                          }`}
                        >
                          {isUnlocked ? (
                            <Icon className="w-6 h-6 text-white" />
                          ) : (
                            <Lock className="w-6 h-6 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg mb-1">
                            {achievement.name}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {achievement.description}
                          </p>
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
                      <>
                        {/* Objetivo */}
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            Objetivo
                          </p>
                          <p className="text-sm text-foreground">
                            {formatCriteria(achievement.criteria)}
                          </p>
                        </div>

                        {/* Barra de Progresso (Placeholder) */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase">
                              Progresso
                            </p>
                            <p className="text-xs text-muted-foreground">
                              0%
                            </p>
                          </div>
                          <Progress value={0} className="h-2 bg-gray-200" indicatorClassName="bg-gray-400" />
                        </div>
                      </>
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

        {allAchievements.length === 0 && (
          <div className="text-center py-12">
            <Award className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">
              Nenhuma conquista disponível no momento
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
