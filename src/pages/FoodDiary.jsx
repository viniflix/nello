import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { User, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getStoredData, setStoredData } from '@/data/mockData';
import { useToast } from '@/components/ui/use-toast';
import DashboardHeader from '@/components/DashboardHeader';
import FoodDiaryEntries from '@/components/food-diary/FoodDiaryEntries';
import FoodDiarySummary from '@/components/food-diary/FoodDiarySummary';
import AddFoodDialog from '@/components/food-diary/AddFoodDialog';
import WeeklyProgressChart from '@/components/food-diary/WeeklyProgressChart';

export default function FoodDiary() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [foodEntries, setFoodEntries] = useState([]);
  const [foods, setFoods] = useState([]);
  const [prescription, setPrescription] = useState(null);
  const [showAddFood, setShowAddFood] = useState(false);

  const loadData = () => {
    const allFoods = getStoredData('foods', []);
    setFoods(allFoods);

    const allEntries = getStoredData('food_entries', []);
    const userEntries = allEntries.filter(entry => 
      entry.patientId === user.id && entry.date === selectedDate
    );
    setFoodEntries(userEntries);

    const allPrescriptions = getStoredData('prescriptions', []);
    const activePrescription = allPrescriptions.find(p => 
      p.patientId === user.id && 
      new Date(selectedDate) >= new Date(p.startDate) && 
      new Date(selectedDate) <= new Date(p.endDate)
    );
    setPrescription(activePrescription);
  };

  useEffect(() => {
    loadData();
  }, [selectedDate, user.id]);

  const handleAddEntry = (newEntry) => {
    const allEntries = getStoredData('food_entries', []);
    allEntries.push(newEntry);
    setStoredData('food_entries', allEntries);
    loadData();
    setShowAddFood(false);
    toast({ title: "Sucesso!", description: "Alimento adicionado ao diário." });
  };

  const handleDeleteEntry = (entryId) => {
    const allEntries = getStoredData('food_entries', []);
    const updatedEntries = allEntries.filter(entry => entry.id !== entryId);
    setStoredData('food_entries', updatedEntries);
    loadData();
    toast({ title: "Removido", description: "Alimento removido do diário." });
  };

  const dayTotals = useMemo(() => {
    return foodEntries.reduce((acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      fat: acc.fat + entry.fat,
      carbs: acc.carbs + entry.carbs
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [foodEntries]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      <DashboardHeader
        user={user}
        logout={logout}
        title="HipoZero"
        subtitle="Diário Alimentar"
        icon={<User className="w-6 h-6 text-white" />}
        backLink="/patient"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Diário Alimentar</h1>
            <p className="text-gray-600">Registre tudo que você consome para um acompanhamento preciso.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <FoodDiarySummary totals={dayTotals} goals={prescription} />
              <FoodDiaryEntries
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                foodEntries={foodEntries}
                onAddFood={() => setShowAddFood(true)}
                onDeleteEntry={handleDeleteEntry}
              />
            </div>

            <div className="space-y-6">
              <WeeklyProgressChart 
                userId={user.id}
                goals={prescription}
              />
            </div>
          </div>
        </motion.div>
      </main>

      <AddFoodDialog
        isOpen={showAddFood}
        setIsOpen={setShowAddFood}
        foods={foods}
        onAddEntry={handleAddEntry}
        userId={user.id}
        selectedDate={selectedDate}
      />
    </div>
  );
}