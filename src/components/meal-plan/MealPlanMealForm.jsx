import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import AddFoodToMealDialog from './AddFoodToMealDialog';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';

const MealPlanMealForm = ({ isOpen, onClose, onSave, initialData = null }) => {
    const [formData, setFormData] = useState({
        name: '',
        meal_type: '',
        meal_time: '',
        notes: ''
    });

    const [foods, setFoods] = useState([]);
    const [showAddFood, setShowAddFood] = useState(false);
    const [editingFood, setEditingFood] = useState(null);
    const [errors, setErrors] = useState({});

    const mealTypes = [
        { value: 'breakfast', label: 'Café da Manhã' },
        { value: 'morning_snack', label: 'Lanche da Manhã' },
        { value: 'lunch', label: 'Almoço' },
        { value: 'afternoon_snack', label: 'Lanche da Tarde' },
        { value: 'dinner', label: 'Jantar' },
        { value: 'supper', label: 'Ceia' },
        { value: 'pre_workout', label: 'Pré-Treino' },
        { value: 'post_workout', label: 'Pós-Treino' },
        { value: 'other', label: 'Outro' }
    ];

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                meal_type: initialData.meal_type || '',
                meal_time: initialData.meal_time || '',
                notes: initialData.notes || ''
            });
            setFoods(initialData.foods || []);
        }
    }, [initialData]);

    const handleChange = (field, value) => {
        setFormData(prev => {
            const newData = { ...prev, [field]: value };

            // Se mudou o tipo e não é "outro", limpar o nome personalizado
            if (field === 'meal_type' && value !== 'other') {
                newData.name = '';
            }

            return newData;
        });

        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const handleAddFood = (foodData) => {
        setFoods(prev => [...prev, { ...foodData, tempId: Date.now() }]);
    };

    const handleEditFood = (food) => {
        setEditingFood(food);
        setShowAddFood(true);
    };

    const handleUpdateFood = (updatedFoodData) => {
        setFoods(prev => prev.map(f =>
            f.tempId === editingFood.tempId
                ? { ...updatedFoodData, tempId: f.tempId }
                : f
        ));
        setEditingFood(null);
    };

    const handleRemoveFood = (tempId) => {
        setFoods(prev => prev.filter(f => f.tempId !== tempId));
    };

    const handleFoodDialogClose = () => {
        setShowAddFood(false);
        setEditingFood(null);
    };

    const calculateTotals = () => {
        return foods.reduce(
            (acc, food) => ({
                calories: acc.calories + (food.calories || 0),
                protein: acc.protein + (food.protein || 0),
                carbs: acc.carbs + (food.carbs || 0),
                fat: acc.fat + (food.fat || 0)
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
    };

    const validate = () => {
        const newErrors = {};

        if (!formData.meal_type) {
            newErrors.meal_type = 'Tipo de refeição é obrigatório';
        }

        // Nome só é obrigatório se tipo = 'other'
        if (formData.meal_type === 'other' && !formData.name.trim()) {
            newErrors.name = 'Nome da refeição é obrigatório quando tipo é "Outro"';
        }

        if (foods.length === 0) {
            newErrors.foods = 'Adicione pelo menos um alimento';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (!validate()) return;

        const totals = calculateTotals();

        // Determinar o nome da refeição
        const mealName = formData.meal_type === 'other'
            ? formData.name
            : mealTypes.find(t => t.value === formData.meal_type)?.label || '';

        const mealData = {
            name: mealName,
            meal_type: formData.meal_type,
            meal_time: formData.meal_time,
            notes: formData.notes,
            foods,
            ...totals
        };

        onSave(mealData);
        handleClose();
    };

    const handleClose = () => {
        setFormData({
            name: '',
            meal_type: '',
            meal_time: '',
            notes: ''
        });
        setFoods([]);
        setErrors({});
        onClose();
    };

    const totals = calculateTotals();

    return (
        <>
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {initialData ? 'Editar Refeição' : 'Nova Refeição'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure a refeição e adicione os alimentos
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Informações da Refeição */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Informações da Refeição</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Tipo */}
                                    <div className="space-y-2">
                                        <Label htmlFor="meal_type">
                                            Tipo de Refeição <span className="text-destructive">*</span>
                                        </Label>
                                        <Select
                                            value={formData.meal_type}
                                            onValueChange={(value) => handleChange('meal_type', value)}
                                        >
                                            <SelectTrigger id="meal_type" className={errors.meal_type ? 'border-destructive' : ''}>
                                                <SelectValue placeholder="Selecione o tipo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {mealTypes.map((type) => (
                                                    <SelectItem key={type.value} value={type.value}>
                                                        {type.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {errors.meal_type && (
                                            <p className="text-xs text-destructive">{errors.meal_type}</p>
                                        )}
                                    </div>

                                    {/* Horário */}
                                    <div className="space-y-2">
                                        <Label htmlFor="meal_time">Horário (opcional)</Label>
                                        <Input
                                            id="meal_time"
                                            type="time"
                                            value={formData.meal_time}
                                            onChange={(e) => handleChange('meal_time', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Nome Personalizado - só aparece se tipo = "outro" */}
                                {formData.meal_type === 'other' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="name">
                                            Nome da Refeição <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="name"
                                            placeholder="Ex: Lanche Noturno, Suplementação"
                                            value={formData.name}
                                            onChange={(e) => handleChange('name', e.target.value)}
                                            className={errors.name ? 'border-destructive' : ''}
                                        />
                                        {errors.name && (
                                            <p className="text-xs text-destructive">{errors.name}</p>
                                        )}
                                    </div>
                                )}

                                {/* Observações */}
                                <div className="space-y-2">
                                    <Label htmlFor="notes">Observações (opcional)</Label>
                                    <Textarea
                                        id="notes"
                                        rows={2}
                                        placeholder="Observações sobre a refeição..."
                                        value={formData.notes}
                                        onChange={(e) => handleChange('notes', e.target.value)}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Alimentos */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Alimentos</CardTitle>
                                    <Button size="sm" onClick={() => setShowAddFood(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Adicionar Alimento
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {foods.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        Nenhum alimento adicionado ainda
                                        {errors.foods && (
                                            <p className="text-destructive mt-2">{errors.foods}</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {foods.map((food) => (
                                            <div
                                                key={food.tempId}
                                                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                                            >
                                                <div className="flex-1">
                                                    <div className="font-semibold">{food.food.name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {formatQuantityWithUnit(food.quantity, food.unit, food.measure)} •
                                                        {' '}{food.calories} kcal •
                                                        P: {food.protein}g •
                                                        C: {food.carbs}g •
                                                        G: {food.fat}g
                                                    </div>
                                                    {food.notes && (
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            {food.notes}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEditFood(food)}
                                                        title="Editar alimento"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveFood(food.tempId)}
                                                        title="Remover alimento"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Totais */}
                                        <div className="mt-4 p-4 bg-primary/5 rounded-lg">
                                            <div className="font-semibold mb-2">Totais da Refeição:</div>
                                            <div className="grid grid-cols-4 gap-4 text-sm">
                                                <div>
                                                    <div className="text-muted-foreground">Calorias</div>
                                                    <div className="font-bold text-lg">{totals.calories.toFixed(1)}</div>
                                                    <div className="text-xs text-muted-foreground">kcal</div>
                                                </div>
                                                <div>
                                                    <div className="text-muted-foreground">Proteínas</div>
                                                    <div className="font-bold text-lg">{totals.protein.toFixed(1)}</div>
                                                    <div className="text-xs text-muted-foreground">g</div>
                                                </div>
                                                <div>
                                                    <div className="text-muted-foreground">Carboidratos</div>
                                                    <div className="font-bold text-lg">{totals.carbs.toFixed(1)}</div>
                                                    <div className="text-xs text-muted-foreground">g</div>
                                                </div>
                                                <div>
                                                    <div className="text-muted-foreground">Gorduras</div>
                                                    <div className="font-bold text-lg">{totals.fat.toFixed(1)}</div>
                                                    <div className="text-xs text-muted-foreground">g</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={handleClose}>
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button onClick={handleSave}>
                            {initialData ? 'Atualizar' : 'Adicionar'} Refeição
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para adicionar/editar alimento */}
            <AddFoodToMealDialog
                isOpen={showAddFood}
                onClose={handleFoodDialogClose}
                onAdd={editingFood ? handleUpdateFood : handleAddFood}
                initialData={editingFood}
                mealName={formData.meal_type === 'other' ? formData.name : mealTypes.find(t => t.value === formData.meal_type)?.label}
            />
        </>
    );
};

export default MealPlanMealForm;
