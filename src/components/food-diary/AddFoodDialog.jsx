import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const AddFoodDialog = ({ isOpen, setIsOpen, foods, onAddEntry, userId, selectedDate }) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [time, setTime] = useState('');

  const filteredFoods = foods.filter(food =>
    food.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    food.group.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateNutrients = (food, grams) => {
    const factor = grams / 100;
    return {
      calories: food.calories * factor,
      protein: food.protein * factor,
      fat: food.fat * factor,
      carbs: food.carbs * factor
    };
  };

  const handleAdd = () => {
    if (!selectedFood || !quantity || !time) {
      toast({ title: "Erro", description: "Preencha todos os campos.", variant: "destructive" });
      return;
    }
    const grams = parseFloat(quantity);
    if (grams <= 0) {
      toast({ title: "Erro", description: "A quantidade deve ser maior que zero.", variant: "destructive" });
      return;
    }

    const nutrients = calculateNutrients(selectedFood, grams);
    const newEntry = {
      id: Date.now(),
      patientId: userId,
      date: selectedDate,
      time: time,
      foodId: selectedFood.id,
      foodName: selectedFood.name,
      quantity: grams,
      ...nutrients
    };

    onAddEntry(newEntry);
    resetState();
  };

  const resetState = () => {
    setSearchTerm('');
    setSelectedFood(null);
    setQuantity('');
    setTime('');
  };

  const handleClose = () => {
    setIsOpen(false);
    resetState();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar Alimento</DialogTitle>
          <DialogDescription>Busque e selecione um alimento para adicionar ao seu diário</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="search">Buscar alimento</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input id="search" placeholder="Digite o nome do alimento..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
          </div>
          
          {searchTerm && (
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              {filteredFoods.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Nenhum alimento encontrado</p>
              ) : (
                filteredFoods.map((food) => (
                  <div
                    key={food.id}
                    className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selectedFood?.id === food.id ? 'bg-emerald-50 border-emerald-200' : ''}`}
                    onClick={() => setSelectedFood(food)}
                  >
                    <div className="font-medium">{food.name}</div>
                    <div className="text-sm text-gray-600">{food.group}</div>
                    <div className="text-xs text-gray-500 mt-1">{food.calories} kcal, {food.protein}g prot, {food.fat}g gord, {food.carbs}g carb (por 100g)</div>
                  </div>
                ))
              )}
            </div>
          )}

          {selectedFood && (
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <h4 className="font-medium text-emerald-800">{selectedFood.name}</h4>
              <p className="text-sm text-emerald-600">{selectedFood.group}</p>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantidade (gramas)</Label>
                  <Input id="quantity" type="number" step="0.1" placeholder="100" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Horário</Label>
                  <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              {quantity > 0 && (
                <div className="mt-3 text-xs text-emerald-700">
                  <strong>Valores nutricionais para {quantity}g:</strong><br />
                  {Math.round(calculateNutrients(selectedFood, parseFloat(quantity)).calories)} kcal, {' '}
                  {Math.round(calculateNutrients(selectedFood, parseFloat(quantity)).protein * 10) / 10}g proteína, {' '}
                  {Math.round(calculateNutrients(selectedFood, parseFloat(quantity)).fat * 10) / 10}g gordura, {' '}
                  {Math.round(calculateNutrients(selectedFood, parseFloat(quantity)).carbs * 10) / 10}g carboidrato
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={!selectedFood || !quantity || !time}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddFoodDialog;