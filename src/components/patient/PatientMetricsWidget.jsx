import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scale, Droplet, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * PatientMetricsWidget - Widget de métricas reais do paciente
 *
 * Mostra:
 * - Último peso registrado
 * - Última glicemia registrada
 * - Tendência de evolução
 */
export default function PatientMetricsWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [latestWeight, setLatestWeight] = useState(null);
  const [latestGlycemia, setLatestGlycemia] = useState(null);
  const [weightTrend, setWeightTrend] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMetrics = async () => {
      if (!user) return;
      setLoading(true);

      // Buscar últimos 2 registros de peso para calcular tendência
      const { data: weightData } = await supabase
        .from('growth_records')
        .select('weight, record_date')
        .eq('patient_id', user.id)
        .order('record_date', { ascending: false })
        .limit(2);

      if (weightData && weightData.length > 0) {
        setLatestWeight(weightData[0]);

        // Calcular tendência
        if (weightData.length === 2) {
          const diff = weightData[0].weight - weightData[1].weight;
          if (diff > 0.5) {
            setWeightTrend('up');
          } else if (diff < -0.5) {
            setWeightTrend('down');
          } else {
            setWeightTrend('stable');
          }
        }
      }

      // Buscar última glicemia - tabela não existe ainda
      // TODO: Criar tabela glycemia_records
      setLatestGlycemia(null);

      setLoading(false);
    };

    loadMetrics();
  }, [user]);

  if (loading) {
    return (
      <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-32">
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = () => {
    if (weightTrend === 'up') return TrendingUp;
    if (weightTrend === 'down') return TrendingDown;
    return Minus;
  };

  const getTrendColor = () => {
    if (weightTrend === 'up') return 'text-red-500';
    if (weightTrend === 'down') return 'text-green-500';
    return 'text-gray-500';
  };

  const TrendIcon = getTrendIcon();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      onClick={() => navigate('/patient/progresso')}
      className="cursor-pointer"
    >
      <Card className="shadow-sm hover:shadow-md transition-all duration-200 bg-white border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-primary flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Meus Indicadores
            </CardTitle>
            {latestWeight && (
              <TrendIcon className={`w-5 h-5 ${getTrendColor()}`} />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* Métrica: Peso */}
            <div className="flex flex-col items-center justify-center p-4 bg-primary/5 rounded-lg">
              <Scale className="w-6 h-6 text-primary mb-2" />
              {latestWeight ? (
                <>
                  <p className="text-2xl font-bold text-primary">
                    {latestWeight.weight}
                    <span className="text-sm font-normal ml-1">kg</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Peso atual
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">--</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sem registro
                  </p>
                </>
              )}
            </div>

            {/* Métrica: Glicemia */}
            <div className="flex flex-col items-center justify-center p-4 bg-secondary/5 rounded-lg">
              <Droplet className="w-6 h-6 text-secondary mb-2" />
              {latestGlycemia ? (
                <>
                  <p className="text-2xl font-bold text-secondary">
                    {latestGlycemia.glycemia_value}
                    <span className="text-sm font-normal ml-1">mg/dL</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Glicemia
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">--</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sem registro
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-primary font-medium">
              Toque para ver todos os gráficos →
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
