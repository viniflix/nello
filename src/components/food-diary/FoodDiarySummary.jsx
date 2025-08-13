import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame, Beef, Droplets, Wheat } from 'lucide-react';

const NutrientProgress = ({ label, icon, value, goal, colorClass }) => {
  const percentage = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  const overPercentage = goal > 0 ? Math.max(((value - goal) / goal) * 100, 0) : 0;

  const getBarColor = () => {
    if (percentage >= 90 && percentage <= 110) return 'bg-green-500';
    if (percentage > 110) return 'bg-red-500';
    return 'bg-yellow-500';
  };

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <div className={`flex items-center font-medium text-sm ${colorClass.text}`}>
          {icon}
          {label}
        </div>
        <div className="text-xs font-semibold text-gray-700">
          {Math.round(value)} / <span className="text-gray-500">{goal}g</span>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 relative overflow-hidden">
        <motion.div
          className={`h-2.5 rounded-full ${getBarColor()}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        {overPercentage > 0 && (
          <motion.div
            className="absolute top-0 left-0 h-2.5 rounded-full bg-red-500 opacity-50"
            initial={{ width: 0 }}
            animate={{ width: `${overPercentage}%` }}
            style={{ left: `${percentage - overPercentage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        )}
      </div>
    </div>
  );
};

const FoodDiarySummary = ({ totals, goals }) => {
  if (!goals) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Resumo do Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-gray-600">Nenhuma meta nutricional encontrada para hoje. Fale com seu nutricionista.</p>
        </CardContent>
      </Card>
    );
  }

  const caloriePercentage = goals.calories > 0 ? (totals.calories / goals.calories) * 100 : 0;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Resumo do Dia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-baseline p-3 bg-orange-50 rounded-lg">
          <div className="flex items-center font-medium text-orange-800">
            <Flame className="w-5 h-5 mr-2" />
            Calorias
          </div>
          <div>
            <span className="text-2xl font-bold text-orange-600">{Math.round(totals.calories)}</span>
            <span className="text-sm text-gray-500"> / {goals.calories} kcal</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <motion.div
            className="bg-gradient-to-r from-orange-400 to-red-500 h-3 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(caloriePercentage, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <NutrientProgress
            label="Proteína"
            icon={<Beef className="w-4 h-4 mr-1.5" />}
            value={totals.protein}
            goal={goals.protein}
            colorClass={{ text: 'text-emerald-800' }}
          />
          <NutrientProgress
            label="Gordura"
            icon={<Droplets className="w-4 h-4 mr-1.5" />}
            value={totals.fat}
            goal={goals.fat}
            colorClass={{ text: 'text-amber-800' }}
          />
          <NutrientProgress
            label="Carboidrato"
            icon={<Wheat className="w-4 h-4 mr-1.5" />}
            value={totals.carbs}
            goal={goals.carbs}
            colorClass={{ text: 'text-blue-800' }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default FoodDiarySummary;