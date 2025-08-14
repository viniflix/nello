
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useDebounce } from '@/hooks/useDebounce';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PlusCircle, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AddFoodDialog = ({ food, onAdd, mealTypes }) => {
  const [quantity, setQuantity] = useState(100);
  const [measure, setMeasure] = useState('gramas');
  const [mealType, setMealType] = useState(mealTypes[0]);
  const [isOpen, setIsOpen] = useState(false);

  const handleAdd = () => {
    onAdd(mealType, { 
        food_id: food.id,
        food_name: food.name,
        quantity: parseFloat(quantity), 
        measure 
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><PlusCircle className="w-4 h-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar {food.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="mealType">Refeição</Label>
            <select id="mealType" value={mealType} onChange={(e) => setMealType(e.target.value)} className="w-full p-2 border rounded-md bg-background">
                {mealTypes.map(mt => <option key={mt} value={mt}>{mt}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantidade</Label>
            <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="measure">Medida</Label>
            <Input id="measure" value={measure} onChange={(e) => setMeasure(e.target.value)} placeholder="g, unidade, fatia..." />
          </div>
        </div>
        <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={handleAdd}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MealPlanEditor = ({ plan, setPlan, dayOfWeek }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  
  const mealTypes = ['Café da Manhã', 'Lanche da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar', 'Ceia'];

  useEffect(() => {
    const searchFoods = async () => {
      if (debouncedSearchTerm.length < 2) {
        setSearchResults([]);
        return;
      }
      setLoadingSearch(true);
      const { data, error } = await supabase
        .from('foods')
        .select('id, name')
        .textSearch('name', debouncedSearchTerm, { type: 'websearch' })
        .limit(10);
      
      if (error) {
        console.error("Error searching foods:", error);
      } else {
        setSearchResults(data);
      }
      setLoadingSearch(false);
    };

    searchFoods();
  }, [debouncedSearchTerm]);

  const handleAddFood = (mealType, foodDetails) => {
    setPlan(prevPlan => {
      const newPlan = JSON.parse(JSON.stringify(prevPlan)); // Deep copy
      if (!newPlan[dayOfWeek]) newPlan[dayOfWeek] = {};
      if (!newPlan[dayOfWeek][mealType]) newPlan[dayOfWeek][mealType] = [];
      
      newPlan[dayOfWeek][mealType].push(foodDetails);
      return newPlan;
    });
  };

  const handleRemoveFood = (mealType, index) => {
    setPlan(prevPlan => {
      const newPlan = JSON.parse(JSON.stringify(prevPlan)); // Deep copy
      newPlan[dayOfWeek][mealType].splice(index, 1);
      
      if (newPlan[dayOfWeek][mealType].length === 0) {
        delete newPlan[dayOfWeek][mealType];
      }
      if (Object.keys(newPlan[dayOfWeek]).length === 0) {
        delete newPlan[dayOfWeek];
      }
      return newPlan;
    });
  };

  const dayPlan = plan[dayOfWeek] || {};

  return (
    <div className="space-y-4">
      <div>
        <Label>Buscar Alimento</Label>
        <Input 
          placeholder="Digite para buscar um alimento..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {loadingSearch && <p className="text-sm text-muted-foreground mt-1">Buscando...</p>}
        {searchResults.length > 0 && (
          <Card className="mt-2">
            <CardContent className="p-2 max-h-40 overflow-y-auto">
              {searchResults.map(food => (
                 <div key={food.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md">
                    <span className="text-sm">{food.name}</span>
                    <AddFoodDialog food={food} onAdd={handleAddFood} mealTypes={mealTypes} />
                 </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {mealTypes.map(mealType => {
            const items = dayPlan[mealType] || [];
            if (items.length === 0) return null;
            return (
                <Card key={mealType}>
                    <CardHeader><CardTitle className="text-base">{mealType}</CardTitle></CardHeader>
                    <CardContent>
                    <ul className="space-y-2">
                        {items.map((item, index) => (
                        <li key={`${item.food_id}-${index}`} className="flex justify-between items-center text-sm">
                            <span>{item.food_name}</span>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-muted-foreground">{item.quantity} {item.measure}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveFood(mealType, index)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </li>
                        ))}
                    </ul>
                    </CardContent>
                </Card>
            )
        })}
        {Object.keys(dayPlan).length === 0 && <p className="text-center text-muted-foreground p-4">Nenhum alimento adicionado para {dayOfWeek}.</p>}
      </div>
    </div>
  );
};

export default MealPlanEditor;
