import React, { useState, useEffect, useCallback } from 'react';
import { Save, X, Plus, Trash2, Edit, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import MealPlanMealForm from './MealPlanMealForm';
import MacrosChart from './MacrosChart';
import { getReferenceValues } from '@/lib/supabase/meal-plan-queries';

const MealPlanForm = ({ patientId, nutritionistId, initialData = null, onSubmit, onCancel, loading = false }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    });

    const [meals, setMeals] = useState([]);
    const [showMealForm, setShowMealForm] = useState(false);
    const [editingMeal, setEditingMeal] = useState(null);
    const [errors, setErrors] = useState({});
    const [referenceValues, setReferenceValues] = useState(null);

    const daysOfWeek = [
        { value: 'monday', label: 'Segunda' },
        { value: 'tuesday', label: 'Terça' },
        { value: 'wednesday', label: 'Quarta' },
        { value: 'thursday', label: 'Quinta' },
        { value: 'friday', label: 'Sexta' },
        { value: 'saturday', label: 'Sábado' },
        { value: 'sunday', label: 'Domingo' }
    ];

    // Carregar valores de referência
    const loadReferenceValues = useCallback(async () => {
        if (initialData?.id) {
            const { data } = await getReferenceValues(initialData.id);
            setReferenceValues(data);
        }
    }, [initialData?.id]);

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                description: initialData.description || '',
                start_date: initialData.start_date || new Date().toISOString().split('T')[0],
                end_date: initialData.end_date || '',
                active_days: initialData.active_days || []
            });

            // Adicionar tempId nas refeições e foods para edição
            const mealsWithTempId = (initialData.meals || []).map((meal, idx) => ({
                ...meal,
                tempId: meal.tempId || Date.now() + idx,
                foods: (meal.foods || []).map((food, foodIdx) => ({
                    ...food,
                    tempId: food.tempId || Date.now() + idx + foodIdx + 1000
                }))
            }));

            setMeals(mealsWithTempId);
            loadReferenceValues();
        }
    }, [initialData, loadReferenceValues]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const handleDayToggle = (day) => {
        setFormData(prev => ({
            ...prev,
            active_days: prev.active_days.includes(day)
                ? prev.active_days.filter(d => d !== day)
                : [...prev.active_days, day]
        }));
    };

    const handleSelectAllDays = () => {
        setFormData(prev => ({
            ...prev,
            active_days: prev.active_days.length === 7 ? [] : daysOfWeek.map(d => d.value)
        }));
    };

    const handleSelectWeekdays = () => {
        const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        setFormData(prev => ({ ...prev, active_days: weekdays }));
    };

    const handleSelectWeekends = () => {
        const weekends = ['saturday', 'sunday'];
        setFormData(prev => ({ ...prev, active_days: weekends }));
    };

    const handleAddMeal = (mealData) => {
        setMeals(prev => [...prev, { ...mealData, tempId: Date.now(), order_index: prev.length }]);
    };

    const handleEditMeal = (meal) => {
        setEditingMeal(meal);
        setShowMealForm(true);
    };

    const handleUpdateMeal = (updatedMeal) => {
        setMeals(prev => prev.map(m => m.tempId === editingMeal.tempId ? { ...updatedMeal, tempId: m.tempId } : m));
        setEditingMeal(null);
    };

    const handleDeleteMeal = (tempId) => {
        setMeals(prev => prev.filter(m => m.tempId !== tempId));
    };

    const calculateDailyTotals = () => {
        return meals.reduce(
            (acc, meal) => ({
                calories: acc.calories + (meal.calories || 0),
                protein: acc.protein + (meal.protein || 0),
                carbs: acc.carbs + (meal.carbs || 0),
                fat: acc.fat + (meal.fat || 0)
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
    };

    const validate = () => {
        const newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Nome do plano é obrigatório';
        }

        if (formData.active_days.length === 0) {
            newErrors.active_days = 'Selecione pelo menos um dia da semana';
        }

        if (!formData.start_date) {
            newErrors.start_date = 'Data de início é obrigatória';
        }

        if (formData.end_date && formData.end_date < formData.start_date) {
            newErrors.end_date = 'Data final deve ser posterior à data inicial';
        }

        if (meals.length === 0) {
            newErrors.meals = 'Adicione pelo menos uma refeição';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!validate()) return;

        const totals = calculateDailyTotals();
        const planData = {
            patient_id: patientId,
            nutritionist_id: nutritionistId,
            ...formData,
            ...totals,
            meals
        };

        onSubmit(planData, initialData?.id);
    };

    const dailyTotals = calculateDailyTotals();

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Informações Básicas */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Informações do Plano</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Nome */}
                        <div className="space-y-2">
                            <Label htmlFor="name">
                                Nome do Plano <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                placeholder="Ex: Dieta Hipertrofia"
                                value={formData.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                className={errors.name ? 'border-destructive' : ''}
                                disabled={loading}
                            />
                            {errors.name && (
                                <p className="text-xs text-destructive">{errors.name}</p>
                            )}
                        </div>

                        {/* Descrição */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Descrição (opcional)</Label>
                            <Textarea
                                id="description"
                                rows={3}
                                placeholder="Descreva os objetivos e características do plano alimentar..."
                                value={formData.description}
                                onChange={(e) => handleChange('description', e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        {/* Datas */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="start_date">
                                    Data de Início <span className="text-destructive">*</span>
                                </Label>
                                <DateInputWithCalendar
                                    id="start_date"
                                    value={formData.start_date}
                                    onChange={(value) => handleChange('start_date', value)}
                                    className={errors.start_date ? 'border-destructive' : ''}
                                    disabled={loading}
                                />
                                {errors.start_date && (
                                    <p className="text-xs text-destructive">{errors.start_date}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="end_date">Data de Término (opcional)</Label>
                                <DateInputWithCalendar
                                    id="end_date"
                                    value={formData.end_date}
                                    onChange={(value) => handleChange('end_date', value)}
                                    className={errors.end_date ? 'border-destructive' : ''}
                                    disabled={loading}
                                />
                                {errors.end_date && (
                                    <p className="text-xs text-destructive">{errors.end_date}</p>
                                )}
                            </div>
                        </div>

                        {/* Dias da Semana */}
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <Label>
                                    Dias Ativos <span className="text-destructive">*</span>
                                </Label>
                                <div className="flex gap-2 flex-shrink-0">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSelectWeekdays}
                                        className="flex-1 sm:flex-none text-xs sm:text-sm"
                                    >
                                        Dias úteis
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSelectWeekends}
                                        className="flex-1 sm:flex-none text-xs sm:text-sm"
                                    >
                                        Fins de semana
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSelectAllDays}
                                        className="flex-1 sm:flex-none text-xs sm:text-sm"
                                    >
                                        {formData.active_days.length === 7 ? 'Limpar' : 'Todos'}
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 gap-1 sm:gap-2">
                                {daysOfWeek.map((day) => (
                                    <label
                                        key={day.value}
                                        className={`
                                            flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3 py-2 border rounded-lg cursor-pointer transition-colors text-xs sm:text-sm
                                            ${formData.active_days.includes(day.value)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'hover:bg-muted'
                                            }
                                        `}
                                    >
                                        <Checkbox
                                            checked={formData.active_days.includes(day.value)}
                                            onCheckedChange={() => handleDayToggle(day.value)}
                                            disabled={loading}
                                            className="h-3 w-3 sm:h-4 sm:w-4"
                                        />
                                        <span className="text-[10px] sm:text-sm leading-tight text-center">{day.label}</span>
                                    </label>
                                ))}
                            </div>
                            {errors.active_days && (
                                <p className="text-xs text-destructive">{errors.active_days}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Grid: Refeições (60%) + Gráfico de Macros (40%) */}
                {meals.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                        {/* Card de Refeições - 60% */}
                        <div className="lg:col-span-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">Refeições</CardTitle>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => {
                                                setEditingMeal(null);
                                                setShowMealForm(true);
                                            }}
                                            disabled={loading}
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Adicionar Refeição
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {meals.map((meal, index) => (
                                            <div
                                                key={meal.tempId}
                                                className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-muted-foreground">
                                                                #{index + 1}
                                                            </span>
                                                            <h4 className="font-semibold">{meal.name}</h4>
                                                            {meal.meal_time && (
                                                                <Badge variant="outline">
                                                                    <Calendar className="h-3 w-3 mr-1" />
                                                                    {meal.meal_time}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground mt-1">
                                                            {meal.foods?.length || 0} alimento(s) •
                                                            {' '}{meal.calories?.toFixed(0) || 0} kcal •
                                                            P: {meal.protein?.toFixed(1) || 0}g •
                                                            C: {meal.carbs?.toFixed(1) || 0}g •
                                                            G: {meal.fat?.toFixed(1) || 0}g
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEditMeal(meal)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteMeal(meal.tempId)}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Gráfico de Macronutrientes - 40% */}
                        <div className="lg:col-span-4">
                            <MacrosChart
                                protein={dailyTotals.protein}
                                carbs={dailyTotals.carbs}
                                fat={dailyTotals.fat}
                                calories={dailyTotals.calories}
                                patientId={patientId}
                                planId={initialData?.id}
                                referenceValues={referenceValues}
                                onReferenceUpdate={loadReferenceValues}
                            />
                        </div>
                    </div>
                )}

                {/* Card de Refeições - Quando vazio */}
                {meals.length === 0 && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">Refeições</CardTitle>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                        setEditingMeal(null);
                                        setShowMealForm(true);
                                    }}
                                    disabled={loading}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Adicionar Refeição
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhuma refeição adicionada ainda
                                {errors.meals && (
                                    <p className="text-destructive mt-2">{errors.meals}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Botões */}
                <div className="flex gap-2 justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        <X className="w-4 h-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={loading}>
                        <Save className="w-4 h-4 mr-2" />
                        {loading ? 'Salvando...' : initialData ? 'Atualizar Plano' : 'Criar Plano'}
                    </Button>
                </div>
            </form>

            {/* Dialog de Refeição */}
            <MealPlanMealForm
                isOpen={showMealForm}
                onClose={() => {
                    setShowMealForm(false);
                    setEditingMeal(null);
                }}
                onSave={editingMeal ? handleUpdateMeal : handleAddMeal}
                initialData={editingMeal}
            />
        </>
    );
};

export default MealPlanForm;
