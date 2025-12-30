import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Search, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Base de dados de exercícios com METs (Metabolic Equivalent of Task)
 * Valores baseados no Compendium of Physical Activities
 */
export const EXERCISE_DATABASE = [
  // Cardio Leve
  { id: 'caminhada_lenta', name: 'Caminhada Lenta', category: 'cardio', met: 2.0, intensity: 'leve' },
  { id: 'caminhada_moderada', name: 'Caminhada Moderada', category: 'cardio', met: 3.5, intensity: 'leve' },
  { id: 'caminhada_rapida', name: 'Caminhada Rápida', category: 'cardio', met: 5.0, intensity: 'moderada' },
  { id: 'ciclismo_leve', name: 'Ciclismo Leve', category: 'cardio', met: 4.0, intensity: 'leve' },
  { id: 'ciclismo_moderado', name: 'Ciclismo Moderado', category: 'cardio', met: 6.0, intensity: 'moderada' },
  { id: 'ciclismo_intenso', name: 'Ciclismo Intenso', category: 'cardio', met: 10.0, intensity: 'intensa' },
  { id: 'natacao_leve', name: 'Natação Leve', category: 'cardio', met: 5.0, intensity: 'leve' },
  { id: 'natacao_moderada', name: 'Natação Moderada', category: 'cardio', met: 7.0, intensity: 'moderada' },
  { id: 'natacao_intensa', name: 'Natação Intensa', category: 'cardio', met: 10.0, intensity: 'intensa' },
  { id: 'corrida_leve', name: 'Corrida Leve (8 km/h)', category: 'cardio', met: 8.0, intensity: 'moderada' },
  { id: 'corrida_moderada', name: 'Corrida Moderada (10 km/h)', category: 'cardio', met: 10.0, intensity: 'intensa' },
  { id: 'corrida_intensa', name: 'Corrida Intensa (12+ km/h)', category: 'cardio', met: 12.0, intensity: 'intensa' },
  { id: 'eliptico', name: 'Elíptico', category: 'cardio', met: 5.0, intensity: 'moderada' },
  { id: 'escada', name: 'Escada/Esteira', category: 'cardio', met: 8.0, intensity: 'intensa' },
  { id: 'remador', name: 'Remador', category: 'cardio', met: 7.0, intensity: 'moderada' },
  
  // Musculação
  { id: 'musculacao_leve', name: 'Musculação Leve', category: 'forca', met: 3.0, intensity: 'leve' },
  { id: 'musculacao_moderada', name: 'Musculação Moderada', category: 'forca', met: 5.0, intensity: 'moderada' },
  { id: 'musculacao_intensa', name: 'Musculação Intensa', category: 'forca', met: 6.0, intensity: 'intensa' },
  { id: 'crossfit', name: 'CrossFit', category: 'forca', met: 8.0, intensity: 'intensa' },
  { id: 'treino_funcional', name: 'Treino Funcional', category: 'forca', met: 6.0, intensity: 'moderada' },
  { id: 'pilates', name: 'Pilates', category: 'forca', met: 3.0, intensity: 'leve' },
  { id: 'yoga', name: 'Yoga', category: 'forca', met: 2.5, intensity: 'leve' },
  
  // Esportes
  { id: 'futebol', name: 'Futebol', category: 'esporte', met: 7.0, intensity: 'intensa' },
  { id: 'basquete', name: 'Basquete', category: 'esporte', met: 8.0, intensity: 'intensa' },
  { id: 'tenis', name: 'Tênis', category: 'esporte', met: 7.0, intensity: 'intensa' },
  { id: 'volei', name: 'Vôlei', category: 'esporte', met: 3.0, intensity: 'moderada' },
  { id: 'danca', name: 'Dança', category: 'esporte', met: 4.5, intensity: 'moderada' },
  { id: 'artes_marciais', name: 'Artes Marciais', category: 'esporte', met: 10.0, intensity: 'intensa' },
  
  // Outros
  { id: 'jump', name: 'Jump/Aula de Step', category: 'cardio', met: 8.0, intensity: 'intensa' },
  { id: 'zumba', name: 'Zumba', category: 'cardio', met: 7.0, intensity: 'moderada' },
  { id: 'spinning', name: 'Spinning', category: 'cardio', met: 9.0, intensity: 'intensa' },
];

const CATEGORIES = [
  { id: 'all', name: 'Todos' },
  { id: 'cardio', name: 'Cardio' },
  { id: 'forca', name: 'Força' },
  { id: 'esporte', name: 'Esportes' },
];

/**
 * Calcula o gasto calórico de uma atividade usando METs
 * Fórmula: kcal = MET × peso(kg) × tempo(h)
 * 
 * @param {number} met - Valor MET da atividade
 * @param {number} weight - Peso em kg
 * @param {number} minutes - Tempo em minutos
 * @returns {number} Gasto calórico em kcal
 */
export const calculateExerciseCalories = (met, weight, minutes) => {
  if (!met || !weight || !minutes) return 0;
  const hours = minutes / 60;
  return met * weight * hours;
};

/**
 * Componente para seleção e gerenciamento de exercícios físicos
 */
export default function ExerciseSelector({ 
  selectedExercises = [], 
  onExercisesChange, 
  patientWeight = 70 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newExercise, setNewExercise] = useState({ exercise: '', minutes: '', daysPerWeek: '3' });

  const filteredExercises = useMemo(() => {
    let filtered = EXERCISE_DATABASE;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(ex => ex.category === selectedCategory);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(ex => 
        ex.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  }, [searchTerm, selectedCategory]);

  const totalWeeklyCalories = useMemo(() => {
    return selectedExercises.reduce((total, exercise) => {
      const exerciseData = EXERCISE_DATABASE.find(e => e.id === exercise.id);
      if (!exerciseData) return total;
      
      const caloriesPerSession = calculateExerciseCalories(
        exerciseData.met,
        patientWeight,
        exercise.minutes
      );
      
      return total + (caloriesPerSession * exercise.daysPerWeek);
    }, 0);
  }, [selectedExercises, patientWeight]);

  const handleAddExercise = (exerciseId) => {
    const exercise = EXERCISE_DATABASE.find(e => e.id === exerciseId);
    if (!exercise) return;
    
    const isAlreadyAdded = selectedExercises.some(e => e.id === exerciseId);
    if (isAlreadyAdded) return;
    
    const newExercise = {
      id: exerciseId,
      minutes: 30,
      daysPerWeek: 3
    };
    
    onExercisesChange([...selectedExercises, newExercise]);
  };

  const handleRemoveExercise = (exerciseId) => {
    onExercisesChange(selectedExercises.filter(e => e.id !== exerciseId));
  };

  const handleUpdateExercise = (exerciseId, field, value) => {
    onExercisesChange(selectedExercises.map(ex => {
      if (ex.id === exerciseId) {
        return { ...ex, [field]: parseFloat(value) || 0 };
      }
      return ex;
    }));
  };

  const getIntensityColor = (intensity) => {
    switch (intensity) {
      case 'leve': return 'bg-green-100 text-green-800 border-green-300';
      case 'moderada': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'intensa': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-4">
      {/* Resumo de Calorias Semanais */}
      {selectedExercises.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gasto Calórico Semanal</p>
                <p className="text-2xl font-bold text-primary">
                  {Math.round(totalWeeklyCalories)} kcal
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ~{Math.round(totalWeeklyCalories / 7)} kcal/dia em média
                </p>
              </div>
              <Activity className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar exercício..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de Exercícios Disponíveis */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {filteredExercises.map(exercise => {
          const isSelected = selectedExercises.some(e => e.id === exercise.id);
          
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => !isSelected && handleAddExercise(exercise.id)}
              disabled={isSelected}
              className={cn(
                "w-full p-3 rounded-lg border-2 transition-all duration-200 text-left",
                "hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isSelected 
                  ? "border-primary bg-primary/5" 
                  : "border-border bg-card hover:border-primary/50"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{exercise.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      MET {exercise.met}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={cn("text-xs", getIntensityColor(exercise.intensity))}
                    >
                      {exercise.intensity}
                    </Badge>
                  </div>
                </div>
                {isSelected && (
                  <Badge className="bg-primary text-xs">✓ Adicionado</Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Exercícios Selecionados */}
      {selectedExercises.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exercícios Selecionados</CardTitle>
            <CardDescription>
              Configure a frequência e duração de cada exercício
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedExercises.map(exercise => {
              const exerciseData = EXERCISE_DATABASE.find(e => e.id === exercise.id);
              if (!exerciseData) return null;
              
              const caloriesPerSession = calculateExerciseCalories(
                exerciseData.met,
                patientWeight,
                exercise.minutes
              );
              const weeklyCalories = caloriesPerSession * exercise.daysPerWeek;
              
              return (
                <div
                  key={exercise.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{exerciseData.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {Math.round(caloriesPerSession)} kcal/sessão × {exercise.daysPerWeek} dias = <strong>{Math.round(weeklyCalories)} kcal/semana</strong>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => handleRemoveExercise(exercise.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`${exercise.id}-minutes`} className="text-xs">
                        Duração (min)
                      </Label>
                      <Input
                        id={`${exercise.id}-minutes`}
                        type="number"
                        min="1"
                        max="300"
                        value={exercise.minutes}
                        onChange={(e) => handleUpdateExercise(exercise.id, 'minutes', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <Label htmlFor={`${exercise.id}-days`} className="text-xs">
                        Dias por semana
                      </Label>
                      <Input
                        id={`${exercise.id}-days`}
                        type="number"
                        min="1"
                        max="7"
                        value={exercise.daysPerWeek}
                        onChange={(e) => handleUpdateExercise(exercise.id, 'daysPerWeek', e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

