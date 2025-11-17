import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Award, Trophy, Target, Flame, Star, TrendingUp } from 'lucide-react';
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
 * RecentAchievementsWidget - Mostra as 3 últimas conquistas desbloqueadas
 */
export default function RecentAchievementsWidget() {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentAchievements = async () => {
      if (!user) return;

      setLoading(true);
      const { data, error } = await supabase
        .from('user_achievements')
        .select(`
          achieved_at,
          achievements (
            name,
            description,
            icon_name
          )
        `)
        .eq('user_id', user.id)
        .order('achieved_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('Erro ao buscar conquistas:', error);
      } else {
        setAchievements(data || []);
      }
      setLoading(false);
    };

    fetchRecentAchievements();
  }, [user]);

  const getIcon = (iconName) => {
    const Icon = ICON_MAP[iconName] || Award;
    return Icon;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Últimas Conquistas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : achievements.length > 0 ? (
          <div className="space-y-3">
            {achievements.map((userAchievement, idx) => {
              const achievement = userAchievement.achievements;
              const Icon = getIcon(achievement.icon_name);
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200"
                >
                  <div className="p-2 bg-yellow-500 rounded-full flex-shrink-0">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">
                      {achievement.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {achievement.description}
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      {format(new Date(userAchievement.achieved_at), "dd 'de' MMMM", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <Award className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Continue registrando para desbloquear conquistas!
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" asChild className="w-full">
          <Link to="/patient/conquistas">
            Ver todas as conquistas
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
