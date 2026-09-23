import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Flame, Beef, Wheat, Droplet } from 'lucide-react';

/**
 * CircularProgress - Gráfico circular de progresso (donut chart)
 */
const CircularProgress = ({ percentage, size = 120, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  // Cor baseada na porcentagem - COM MELHOR CONTRASTE
  const getColor = () => {
    if (percentage === 0) return '#d1d5db'; // Cinza claro quando vazio
    if (percentage >= 90) return '#22c55e'; // Verde
    if (percentage >= 50) return '#eab308'; // Amarelo
    return '#f97316'; // Laranja
  };

  // Cor de fundo também ajustada
  const getBackgroundOpacity = () => {
    if (percentage === 0) return 'text-muted/10'; // Muito claro quando vazio
    return 'text-muted/20';
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Círculo de fundo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className={getBackgroundOpacity()}
        />
        {/* Círculo de progresso */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Texto no centro */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl md:text-3xl font-bold ${percentage === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
          {Math.round(percentage)}%
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">do dia</span>
      </div>
    </div>
  );
};

/**
 * MacroMiniCard - Mini card para cada macro (Proteínas, Carboidratos, Gorduras)
 */
const MacroMiniCard = ({ icon: Icon, label, current, goal, unit, iconColor, progressColor }) => {
  const percentage = goal > 0 ? Math.min(Math.round((current / goal) * 100), 100) : 0;

  return (
    <Card className="border border-muted/30 hover:border-primary/30 transition-colors overflow-hidden">
      <CardContent className="p-2 md:p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <div className={`p-1 md:p-1.5 rounded-lg flex-shrink-0 ${iconColor}`}>
              <Icon className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
          </div>
          <span className="text-xs text-muted-foreground font-semibold flex-shrink-0">
            {percentage}%
          </span>
        </div>

        {/* Valores */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-baseline gap-0.5 min-w-0">
            <span className="text-base md:text-lg font-bold text-foreground truncate">
              {Math.round(current)}
            </span>
            <span className="text-xs text-muted-foreground truncate flex-shrink-0">
              /{Math.round(goal)}{unit}
            </span>
          </div>

          {/* Mini barra de progresso - TRACK NEUTRO */}
          <Progress
            value={percentage}
            className="h-1 bg-muted"
            indicatorClassName={progressColor}
          />
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * DailyAdherenceCard - Card de Progresso de Macros Diário
 * Layout otimizado para mobile e desktop
 */
export default function DailyAdherenceCard({ goal, current }) {
  // Se não houver metas ou progresso, não renderiza nada
  if (!goal || !current) {
    return null;
  }

  // Cálculo de porcentagem de calorias (macro principal)
  const caloriesPercentage = goal.calories > 0
    ? Math.min(Math.round((current.calories / goal.calories) * 100), 100)
    : 0;

  // Mensagem motivacional baseada no progresso
  const getMotivationalMessage = () => {
    if (caloriesPercentage >= 90) {
      return {
        icon: '🎉',
        text: 'Parabéns! Você está quase lá!',
        color: 'text-green-600'
      };
    } else if (caloriesPercentage >= 50) {
      return {
        icon: '💪',
        text: 'Continue assim! Você já está na metade do caminho.',
        color: 'text-yellow-600'
      };
    } else if (caloriesPercentage > 0) {
      return {
        icon: '🚀',
        text: 'Ótimo começo! Continue registrando suas refeições.',
        color: 'text-orange-600'
      };
    } else {
      return {
        icon: '📝',
        text: 'Comece registrando suas refeições para acompanhar seu progresso.',
        color: 'text-muted-foreground'
      };
    }
  };

  const motivation = getMotivationalMessage();

  return (
    <Card className="shadow-card-dark rounded-xl border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <CardTitle className="text-base md:text-lg font-semibold text-primary">
              Progresso Diário
            </CardTitle>
          </div>
          <div className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            {caloriesPercentage}%
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* SEÇÃO DE CALORIAS (Destaque) */}
        <Card className="border border-primary/30 bg-gradient-to-br from-orange-50/50 to-amber-50/50 dark:from-orange-950/20 dark:to-amber-950/20">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Gráfico Circular - MENOR NO MOBILE */}
              <div className="flex-shrink-0">
                <CircularProgress percentage={caloriesPercentage} size={120} strokeWidth={10} />
              </div>

              {/* Informações de Calorias */}
              <div className="flex-1 space-y-3 text-center sm:text-left w-full">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-red-500">
                    <Flame className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Calorias
                    </h3>
                    <p className="text-2xl md:text-3xl font-bold text-foreground">
                      {Math.round(current.calories)}
                      <span className="text-base md:text-lg text-muted-foreground font-normal">
                        {' '}/ {Math.round(goal.calories)} kcal
                      </span>
                    </p>
                  </div>
                </div>

                {/* Mensagem motivacional */}
                <div className={`flex items-center gap-2 justify-center sm:justify-start ${motivation.color}`}>
                  <span className="text-base">{motivation.icon}</span>
                  <p className="text-xs md:text-sm font-medium">{motivation.text}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GRID DE MACROS SECUNDÁRIOS - 3 COLUNAS SEMPRE (MESMO NO MOBILE) */}
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          {/* Proteínas - AZUL CLARO */}
          <MacroMiniCard
            icon={Beef}
            label="Proteínas"
            current={current.protein}
            goal={goal.protein}
            unit="g"
            iconColor="bg-gradient-to-br from-sky-500 to-sky-600"
            progressColor="bg-sky-500"
          />

          {/* Carboidratos - LARANJA */}
          <MacroMiniCard
            icon={Wheat}
            label="Carboidratos"
            current={current.carbs}
            goal={goal.carbs}
            unit="g"
            iconColor="bg-gradient-to-br from-orange-500 to-orange-600"
            progressColor="bg-orange-500"
          />

          {/* Gorduras - AMARELO */}
          <MacroMiniCard
            icon={Droplet}
            label="Gorduras"
            current={current.fat}
            goal={goal.fat}
            unit="g"
            iconColor="bg-gradient-to-br from-yellow-400 to-yellow-500"
            progressColor="bg-yellow-400"
          />
        </div>
      </CardContent>
    </Card>
  );
}
