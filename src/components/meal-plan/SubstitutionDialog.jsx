import React, { useState, useEffect } from 'react';
import { Search, X, Trash2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import FoodSelector from './FoodSelector';
import { calculateCaloriesFromMacros } from '@/lib/utils/nutrition-calculations';

const SubstitutionDialog = ({ isOpen, onClose, originalFood, initialSubstitutes = [], onSave }) => {
    const [substitutes, setSubstitutes] = useState([]);
    const [showFoodSelector, setShowFoodSelector] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSubstitutes(initialSubstitutes || []);
        }
    }, [isOpen, initialSubstitutes]);

    const handleAddSubstitute = (food) => {
        // Evitar duplicatas
        if (substitutes.some(s => s.id === food.id)) {
            setShowFoodSelector(false);
            return;
        }
        setSubstitutes(prev => [...prev, food]);
        setShowFoodSelector(false);
    };

    const handleRemoveSubstitute = (foodId) => {
        setSubstitutes(prev => prev.filter(s => s.id !== foodId));
    };

    const handleSave = () => {
        onSave(substitutes);
        onClose();
    };

    // Sugestão de substituição (±50 kcal, ±3g macros)
    const checkBalance = (subFood) => {
        if (!originalFood) return { isBalanced: true };

        const originalBaseKcal = (originalFood.calories / originalFood.quantity) * 100;
        const originalBaseProt = (originalFood.protein / originalFood.quantity) * 100;
        const originalBaseCarb = (originalFood.carbs / originalFood.quantity) * 100;
        const originalBaseFat = (originalFood.fat / originalFood.quantity) * 100;

        const kcalDelta = subFood.calories - originalBaseKcal;
        const protDelta = subFood.protein - originalBaseProt;
        const carbDelta = subFood.carbs - originalBaseCarb;
        const fatDelta = subFood.fat - originalBaseFat;

        const isBalanced = Math.abs(kcalDelta) <= 50 && 
                          Math.abs(protDelta) <= 3 && 
                          Math.abs(carbDelta) <= 3 && 
                          Math.abs(fatDelta) <= 3;
        
        return {
            isBalanced,
            kcalDelta,
            protDelta,
            carbDelta,
            fatDelta,
            violations: [
                Math.abs(kcalDelta) > 50 && `${kcalDelta > 0 ? '+' : ''}${Math.round(kcalDelta)} kcal fora do limite (±50 kcal)`,
                Math.abs(protDelta) > 3 && `proteína ${protDelta > 0 ? '+' : ''}${protDelta.toFixed(1)}g fora do limite (±3g)`,
                Math.abs(carbDelta) > 3 && `carboidrato ${carbDelta > 0 ? '+' : ''}${carbDelta.toFixed(1)}g fora do limite (±3g)`,
                Math.abs(fatDelta) > 3 && `gordura ${fatDelta > 0 ? '+' : ''}${fatDelta.toFixed(1)}g fora do limite (±3g)`
            ].filter(Boolean)
        };
    };

    const renderDelta = (val, limit = 3) => {
        if (Math.abs(val) < 0.1) return null;
        const isOver = Math.abs(val) > limit;
        return (
            <span className={`text-[10px] flex items-center gap-0.5 ${isOver ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                {val > 0 ? <Plus className="h-2 w-2" /> : <X className="h-2 w-2 rotate-45" />}
                {Math.abs(val).toFixed(1)}
                {val > 0 ? ' ↑' : ' ↓'}
            </span>
        );
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Substituições de Alimento</DialogTitle>
                        <DialogDescription>
                            Diferença de mais ou menos 50 kcal e ±3g de macros (carboidratos, proteínas e gorduras).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Alimento Original */}
                        {originalFood && (
                            <div className="p-4 bg-muted rounded-lg border">
                                <Label className="text-xs uppercase text-muted-foreground font-bold">Alimento Referência (Base 100g)</Label>
                                <div className="mt-1 flex justify-between items-center">
                                    <div>
                                        <div className="font-semibold">{originalFood.patient_description || originalFood.food?.name}</div>
                                        <div className="text-sm text-muted-foreground italic">Valores proporcionais para comparação</div>
                                    </div>
                                    <div className="flex gap-4 text-xs font-mono">
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">Kcal</div>
                                            <div className="font-bold">{Math.round((originalFood.calories / originalFood.quantity) * 100)}</div>
                                        </div>
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">P</div>
                                            <div className="font-bold">{((originalFood.protein / originalFood.quantity) * 100).toFixed(1)}</div>
                                        </div>
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">C</div>
                                            <div className="font-bold">{((originalFood.carbs / originalFood.quantity) * 100).toFixed(1)}</div>
                                        </div>
                                        <div className="text-center p-1 px-2 bg-background rounded">
                                            <div className="text-muted-foreground text-[10px]">G</div>
                                            <div className="font-bold">{((originalFood.fat / originalFood.quantity) * 100).toFixed(1)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-base font-semibold">Candidatos a Substituto</Label>
                                <Button size="sm" onClick={() => setShowFoodSelector(true)}>
                                    <Search className="h-4 w-4 mr-2" />
                                    Buscar Alimento
                                </Button>
                            </div>

                            {substitutes.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-xl text-muted-foreground bg-muted/20">
                                    Nenhum substituto selecionado. Busque alimentos para comparar.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 max-h-[350px] overflow-y-auto pr-2">
                                    {substitutes.map(sub => {
                                        const balance = checkBalance(sub);
                                        return (
                                            <div key={sub.id} className={`flex flex-col p-3 border rounded-lg transition-all ${balance.isBalanced ? 'bg-green-50/30 border-green-100' : 'bg-card'}`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium">{sub.name}</span>
                                                            {balance.isBalanced ? (
                                                                <Badge className="h-5 text-[10px] bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                                                                    Compatível
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="h-5 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                                    Substituição não recomendada
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-1 flex gap-4 items-center">
                                                            <div className="flex items-center gap-1.5 focus:bg-muted p-0.5 rounded">
                                                                <span className="font-semibold text-foreground">{sub.calories} kcal</span>
                                                                {renderDelta(balance.kcalDelta, 50)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 p-0.5 rounded">
                                                                <span>P: {sub.protein.toFixed(1)}g</span>
                                                                {renderDelta(balance.protDelta, 3)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 p-0.5 rounded">
                                                                <span>C: {sub.carbs.toFixed(1)}g</span>
                                                                {renderDelta(balance.carbDelta, 3)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 p-0.5 rounded">
                                                                <span>G: {sub.fat.toFixed(1)}g</span>
                                                                {renderDelta(balance.fatDelta, 3)}
                                                            </div>
                                                        </div>
                                                        
                                                        {balance.violations.length > 0 && (
                                                            <div className="mt-2 text-[10px] text-destructive flex flex-wrap gap-x-2 gap-y-0.5">
                                                                {balance.violations.map((v, i) => (
                                                                    <span key={i} className="flex items-center gap-1">
                                                                        <AlertCircle className="h-2.5 w-2.5" />
                                                                        {v}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => handleRemoveSubstitute(sub.id)}
                                                        className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                        <Alert className="bg-blue-50/50 border-blue-100">
                            <AlertCircle className="h-4 w-4 text-blue-600" />
                            <AlertDescription className="text-[11px] text-blue-700">
                                Idealmente, substitutos devem ter variação de ±50 kcal e ±3g de macros em relação ao alimento original (proporcionalmente).
                            </AlertDescription>
                        </Alert>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={handleSave}>Salvar Substituições</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <FoodSelector
                isOpen={showFoodSelector}
                onClose={() => setShowFoodSelector(false)}
                onSelect={handleAddSubstitute}
            />
        </>
    );
};

export default SubstitutionDialog;
