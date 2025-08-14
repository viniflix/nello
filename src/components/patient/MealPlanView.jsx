
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UtensilsCrossed } from 'lucide-react';

const MealPlanView = ({ mealPlanItems }) => {
  if (!mealPlanItems || mealPlanItems.length === 0) {
    return (
      <div className="text-center py-10">
        <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Nenhum plano alimentar detalhado foi adicionado a esta prescrição.</p>
      </div>
    );
  }

  const dayOrder = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const mealOrder = ['Café da Manhã', 'Lanche da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar', 'Ceia'];

  const planByDay = mealPlanItems.reduce((acc, item) => {
    const day = item.day_of_week;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(item);
    return acc;
  }, {});

  const sortedDays = Object.keys(planByDay).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

  return (
    <div className="space-y-6">
      {sortedDays.map((day) => {
        const mealsForDay = planByDay[day].reduce((acc, item) => {
          const mealType = item.meal_type;
          if (!acc[mealType]) {
            acc[mealType] = [];
          }
          acc[mealType].push(item);
          return acc;
        }, {});
        
        const sortedMealTypes = Object.keys(mealsForDay).sort((a, b) => mealOrder.indexOf(a) - mealOrder.indexOf(b));

        return (
          <Card key={day} className="bg-background/50">
            <CardHeader>
              <CardTitle className="text-xl">{day}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedMealTypes.map((mealType) => (
                <div key={mealType}>
                  <h4 className="font-semibold text-md mb-2">{mealType}</h4>
                  <ul className="space-y-2 pl-4 border-l-2 border-primary/20">
                    {mealsForDay[mealType].map((item, index) => (
                      <li key={index} className="flex justify-between items-center text-sm">
                        <span>{item.foods.name}</span>
                        <span className="font-semibold text-muted-foreground">{item.quantity} {item.measure}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default MealPlanView;
