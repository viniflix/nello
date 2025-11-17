import React, { useMemo, useState } from 'react';
import { Clock, UtensilsCrossed, CheckCircle2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { translateMealType, translateUnit } from '@/utils/mealTranslations';
import { format, parse } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

/**
 * NextMealCard - Exibe a próxima refeição baseada no horário atual
 * Com navegação entre refeições e CTA para registrar
 */
const NextMealCard = ({ mealPlanMeals, registeredMeals = [] }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Ordenar refeições por horário
  const sortedMeals = useMemo(() => {
    if (!mealPlanMeals || mealPlanMeals.length === 0) return [];

    const mealsWithTime = mealPlanMeals
      .filter(meal => meal.meal_time)
      .map(meal => {
        const timeParts = meal.meal_time.split(':');
        const mealMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
        return {
          ...meal,
          mealMinutes,
          timeStr: `${timeParts[0]}:${timeParts[1]}`
        };
      })
      .sort((a, b) => a.mealMinutes - b.mealMinutes);

    return mealsWithTime;
  }, [mealPlanMeals]);

  // Encontrar índice da próxima refeição
  const nextMealIndex = useMemo(() => {
    if (sortedMeals.length === 0) return 0;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const registeredTypes = new Set(registeredMeals.map(m => m.meal_type));

    for (let i = 0; i < sortedMeals.length; i++) {
      const meal = sortedMeals[i];

      if (registeredTypes.has(meal.meal_type)) continue;

      if (meal.mealMinutes > currentMinutes) return i;

      const nextMeal = sortedMeals[i + 1];
      if (nextMeal) {
        const timeSinceMeal = currentMinutes - meal.mealMinutes;
        const timeUntilNext = nextMeal.mealMinutes - currentMinutes;
        if (timeSinceMeal <= timeUntilNext) return i;
      } else {
        return i;
      }
    }

    return 0;
  }, [sortedMeals, registeredMeals]);

  // Usar índice personalizado ou próximo automático
  const displayIndex = currentIndex !== 0 ? currentIndex : nextMealIndex;
  const meal = sortedMeals[displayIndex];

  // Verificar se já foi registrada
  const isRegistered = useMemo(() => {
    if (!meal) return false;
    const registeredTypes = new Set(registeredMeals.map(m => m.meal_type));
    return registeredTypes.has(meal.meal_type);
  }, [meal, registeredMeals]);

  const handlePrevious = () => {
    setCurrentIndex(prev => {
      const newIndex = displayIndex - 1;
      return newIndex < 0 ? sortedMeals.length - 1 : newIndex;
    });
  };

  const handleNext = () => {
    setCurrentIndex(prev => {
      const newIndex = displayIndex + 1;
      return newIndex >= sortedMeals.length ? 0 : newIndex;
    });
  };

  const handleRegisterMeal = () => {
    navigate('/patient/add-meal', {
      state: {
        mealType: meal.meal_type,
        mealTime: meal.timeStr,
        mealName: meal.name,
        recommendedFoods: meal.meal_plan_foods
      }
    });
  };

  if (!meal || sortedMeals.length === 0) {
    return (
      <div className="text-center py-8">
        <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Nenhuma refeição com horário definido.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status de registro */}
      {isRegistered && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">
            Você já registrou esta refeição!
          </p>
        </div>
      )}

      {/* Conteúdo da refeição */}
      <div className="border-l-4 border-primary pl-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-lg text-foreground">
            {translateMealType(meal.meal_type)}
          </h4>
          <div className="flex items-center gap-1 text-primary">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">{meal.timeStr}</span>
          </div>
        </div>

        {meal.name && (
          <p className="text-sm text-muted-foreground mb-3 italic">{meal.name}</p>
        )}

        {meal.meal_plan_foods && meal.meal_plan_foods.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {meal.meal_plan_foods.map((foodItem, index) => (
              <li key={index} className="flex justify-between items-center gap-3 text-sm">
                <span className="text-foreground flex-1 min-w-0">
                  • {foodItem.foods?.name || 'Alimento sem nome'}
                </span>
                <span className="font-medium text-primary whitespace-nowrap flex-shrink-0 text-right">
                  {foodItem.quantity} {translateUnit(foodItem.unit)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic mb-4">Nenhum alimento cadastrado</p>
        )}

        {/* CTA de registro */}
        {!isRegistered && (
          <Button
            onClick={handleRegisterMeal}
            className="w-full mt-2"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Registrar Esta Refeição
          </Button>
        )}
      </div>

      {/* Navegação entre refeições */}
      {sortedMeals.length > 1 && (
        <div className="flex items-center justify-between pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            className="text-muted-foreground hover:text-primary"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Anterior
          </Button>

          <span className="text-xs text-muted-foreground">
            {displayIndex + 1} de {sortedMeals.length}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            className="text-muted-foreground hover:text-primary"
          >
            Próxima
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default NextMealCard;
