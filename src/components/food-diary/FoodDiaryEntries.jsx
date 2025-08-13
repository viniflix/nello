import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const FoodEntryItem = ({ entry, onDeleteEntry }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
  >
    <div className="flex-1">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-medium text-gray-900">{entry.foodName}</h4>
          <p className="text-sm text-gray-600">{entry.quantity}g • {entry.time}</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium text-orange-600">{Math.round(entry.calories)} kcal</div>
          <div className="text-xs text-gray-500">
            P: {Math.round(entry.protein * 10) / 10}g • 
            G: {Math.round(entry.fat * 10) / 10}g • 
            C: {Math.round(entry.carbs * 10) / 10}g
          </div>
        </div>
      </div>
    </div>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onDeleteEntry(entry.id)}
      className="ml-2 text-red-600 hover:text-red-700 hover:bg-red-50"
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  </motion.div>
);

const FoodDiaryEntries = ({ selectedDate, setSelectedDate, foodEntries, onAddFood, onDeleteEntry }) => {
  const groupEntriesByTime = () => {
    const grouped = {};
    foodEntries.forEach(entry => {
      const hour = entry.time.split(':')[0];
      let period;
      
      if (hour >= 5 && hour < 12) period = 'Café da manhã';
      else if (hour >= 12 && hour < 17) period = 'Almoço';
      else if (hour >= 17 && hour < 21) period = 'Jantar';
      else period = 'Lanche';

      if (!grouped[period]) grouped[period] = [];
      grouped[period].push(entry);
    });
    return grouped;
  };

  const groupedEntries = groupEntriesByTime();

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Registros do Dia</CardTitle>
            <CardDescription>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-2 w-auto"
              />
            </CardDescription>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onAddFood}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {foodEntries.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum registro hoje</h3>
            <p className="text-gray-600">Adicione alimentos para começar a acompanhar sua alimentação.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEntries).map(([period, entries]) => (
              <div key={period}>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-emerald-600" />
                  {period}
                </h3>
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <FoodEntryItem key={entry.id} entry={entry} onDeleteEntry={onDeleteEntry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FoodDiaryEntries;