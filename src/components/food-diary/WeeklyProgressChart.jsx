import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getStoredData } from '@/data/mockData';

const WeeklyProgressChart = ({ userId, goals }) => {
  const weeklyData = useMemo(() => {
    const allEntries = getStoredData('food_entries', []);
    const userEntries = allEntries.filter(entry => entry.patientId === userId);
    
    const dataByDay = {};
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      dataByDay[dateString] = {
        date: dateString,
        day: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        protein: 0,
        fat: 0,
        carbs: 0,
      };
    }

    userEntries.forEach(entry => {
      if (dataByDay[entry.date]) {
        dataByDay[entry.date].protein += entry.protein;
        dataByDay[entry.date].fat += entry.fat;
        dataByDay[entry.date].carbs += entry.carbs;
      }
    });

    return Object.values(dataByDay).map(day => ({
      ...day,
      protein: Math.round(day.protein),
      fat: Math.round(day.fat),
      carbs: Math.round(day.carbs),
    }));
  }, [userId]);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Progresso Semanal</CardTitle>
        <CardDescription>Consumo de macronutrientes nos últimos 7 dias</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(5px)',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                borderRadius: '0.5rem',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '14px' }} />
            <Bar dataKey="protein" name="Proteína" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="fat" name="Gordura" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="carbs" name="Carboidrato" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default WeeklyProgressChart;