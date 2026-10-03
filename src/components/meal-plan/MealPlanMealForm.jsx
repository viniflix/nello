import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X, Edit, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/date-input';
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
import { formatNutrient } from '@/lib/utils';
import AddFoodToMealDialog from './AddFoodToMealDialog';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import SubstitutionDialog from './SubstitutionDialog';
import { isValidMealTime, normalizeMealTime } from '@/lib/utils/mealTime';
import { useShadowDraft } from '@/hooks/useShadowDraft';
import { ensureMealFoodIds } from '@/lib/utils/mealEditing';
import { ShadowRecovery, ShadowSaveStatus } from '@/components/ui/shadow-save-status';

const MealPlanMealForm = ({ isOpen, onClose, onSave, initialData = null, ownerId, shadowKey, recoveryDraft = null, draftContext = null, resumeState = null, onWorkingState, session = null, foodTarget = null }) => {
    const [formData, setFormData] = useState({
        name: '',
        meal_type: '',
        meal_time: '',
        notes: ''
    });

    const [foods, setFoods] = useState([]);
    const [showAddFood, setShowAddFood] = useState(false);
    const [editingFood, setEditingFood] = useState(null);
    const [showSubstitutions, setShowSubstitutions] = useState(false);
    const [substitutingFood, setSubstitutingFood] = useState(null);
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const touchedRef = useRef(false);
    const recoveryOpenedRef = useRef(null);
    const sessionRestoredRef = useRef(false);
    const foodTargetRef = useRef(null);
    const [foodEditorState, setFoodEditorState] = useState(null);
    const shadow = useShadowDraft({ ownerId, draftKey: shadowKey, enabled: isOpen && Boolean(ownerId && shadowKey) });
    const contextJson = JSON.stringify(draftContext);

    useEffect(() => {
        if (!session && isOpen && shadow.ready && touchedRef.current) shadow.queue({ formData, foods, context: JSON.parse(contextJson) });
    }, [isOpen, shadow.ready, shadow.queue, formData, foods, contextJson, session]);

    useEffect(() => {
        if (!isOpen || !shadow.ready || !recoveryDraft || recoveryOpenedRef.current === recoveryDraft.id) return;
        if (recoveryDraft.draft_key.includes(':food:')) {
            recoveryOpenedRef.current = recoveryDraft.id;
            const meal = recoveryDraft.payload?.context?.mealSnapshot;
            const recoveredFoods = ensureMealFoodIds(meal?.foods || initialData?.foods);
            if (meal) { setFormData(meal.formData); setFoods(recoveredFoods); }
            if (shadow.recovery) shadow.restore();
            const foodId = recoveryDraft.payload?.context?.foodId;
            setEditingFood(foodId ? recoveredFoods.find(food => String(food.id) === String(foodId)) || null : null);
            setShowAddFood(true);
        } else if (shadow.ready && shadow.recovery) {
            recoveryOpenedRef.current = recoveryDraft.id;
            restoreShadow();
        }
    // Apply the explicitly selected saved editor only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, recoveryDraft, shadow.ready, shadow.recovery, initialData]);

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
            setFoods(ensureMealFoodIds(initialData.foods));
        }
    }, [initialData]);
    useEffect(() => {
        if (!isOpen) { foodTargetRef.current = null; return; }
        if (!foodTarget || foodTargetRef.current === foodTarget) return;
        foodTargetRef.current = foodTarget;
        setEditingFood(foodTarget.food || null);
        setShowAddFood(true);
    }, [isOpen, foodTarget]);

    const restoreShadow = () => {
        const value = shadow.restore();
        if (!value) return;
        touchedRef.current = true;
        if (value.formData) setFormData(value.formData);
        if (Array.isArray(value.foods)) setFoods(ensureMealFoodIds(value.foods));
    };
    useEffect(() => {
        if (!isOpen || !resumeState || sessionRestoredRef.current) return;
        sessionRestoredRef.current = true;
        if (resumeState.formData) setFormData(resumeState.formData);
        const recoveredFoods = ensureMealFoodIds(resumeState.foods);
        if (Array.isArray(resumeState.foods)) setFoods(recoveredFoods);
        setFoodEditorState(resumeState.foodEditor?.state || null);
        setShowAddFood(Boolean(resumeState.foodEditor?.open));
        const foodId = resumeState.foodEditor?.foodId;
        setEditingFood(foodId ? recoveredFoods.find(food => String(food.id || food.tempId) === String(foodId)) || null : null);
    }, [isOpen, resumeState]);
    const editorJson = JSON.stringify({ formData, foods, foodEditor: { open: showAddFood, foodId: editingFood?.id || editingFood?.tempId || null, state: foodEditorState } });
    useEffect(() => { if (isOpen) onWorkingState?.(JSON.parse(editorJson)); }, [isOpen, onWorkingState, editorJson]);

    const handleChange = (field, value) => {
        touchedRef.current = true;
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
        touchedRef.current = true;
        setFoods(prev => [...prev, { ...foodData, tempId: crypto.randomUUID() }]);
    };

    const handleEditFood = (food) => {
        setEditingFood(food);
        setShowAddFood(true);
    };

    const handleUpdateFood = (updatedFoodData) => {
        touchedRef.current = true;
        setFoods(prev => prev.map(f =>
            f.tempId === editingFood.tempId
                ? { ...f, ...updatedFoodData, id: f.id, tempId: f.tempId }
                : f
        ));
        setEditingFood(null);
    };

    const handleRemoveFood = (tempId) => {
        touchedRef.current = true;
        setFoods(prev => prev.filter(f => f.tempId !== tempId));
    };

    const handleOpenSubstitutions = (food) => {
        setSubstitutingFood(food);
        setShowSubstitutions(true);
    };

    const handleSaveSubstitutions = (substitutes) => {
        touchedRef.current = true;
        setFoods(prev => prev.map(f =>
            f.tempId === substitutingFood.tempId
                ? { ...f, substitutes }
                : f
        ));
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

        if (!isValidMealTime(formData.meal_time)) {
            newErrors.meal_time = 'Informe um horário completo no formato HH:MM ou deixe em branco';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;

        const totals = calculateTotals();

        // Determinar o nome da refeição
        const mealName = formData.meal_type === 'other'
            ? formData.name
            : mealTypes.find(t => t.value === formData.meal_type)?.label || '';

        const mealData = {
            name: mealName,
            meal_type: formData.meal_type,
            meal_time: normalizeMealTime(formData.meal_time),
            notes: formData.notes,
            foods,
            ...totals
        };

        setIsSaving(true);
        setErrors((current) => ({ ...current, save: undefined }));
        try {
            const saved = await onSave(mealData);
            if (saved === false) {
                setErrors((current) => ({
                    ...current,
                    save: 'Não foi possível salvar esta refeição. Seus dados foram mantidos; tente novamente.'
                }));
                return;
            }
            await shadow.discard();
            handleClose();
        } catch {
            setErrors((current) => ({
                ...current,
                save: 'Não foi possível salvar esta refeição. Seus dados foram mantidos; tente novamente.'
            }));
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = async () => {
        if (session && ['local', 'saving', 'error', 'conflict'].includes(session.status) && !(await session.flush())) return;
        if (!session && touchedRef.current && ['local', 'saving', 'error', 'conflict'].includes(shadow.status) && !(await shadow.flush())) return;
        touchedRef.current = false;
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
            <Dialog open={isOpen && !showAddFood && !showSubstitutions} onOpenChange={handleClose}>
                <DialogContent className="flex h-[90dvh] max-h-[calc(100dvh-1rem)] w-[96vw] max-w-[1200px] flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>
                            {initialData ? 'Editar Refeição' : 'Nova Refeição'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure a refeição e adicione os alimentos
                        </DialogDescription>
                    </DialogHeader>

                    {recoveryDraft && !recoveryDraft.payload?.context?.mealId && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Edição recuperada. Confira os dados antes de adicionar a refeição ao plano.</p>}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {session?.recovery && session.reopen && <ShadowRecovery recovery={session.recovery} onRestore={() => { void session.reopen(); }} onDiscard={() => { void session.discardRecovery(); }} />}
                        {!resumeState && <ShadowRecovery recovery={shadow.recovery} onRestore={restoreShadow} onDiscard={() => { void shadow.discardRecovery(); }} />}
                        <ShadowSaveStatus status={session?.status || shadow.status} onRetry={session?.flush || shadow.flush} />
                    </div>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                        {/* Informações da Refeição */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Informações da Refeição</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                                        <TimeInput
                                            id="meal_time"
                                            value={formData.meal_time}
                                            onChange={(value) => handleChange('meal_time', value)}
                                            className={errors.meal_time ? 'border-destructive' : ''}
                                        />
                                        {errors.meal_time && (
                                            <p className="text-xs text-destructive">{errors.meal_time}</p>
                                        )}
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
                                    <Button type="button" size="sm" onClick={() => setShowAddFood(true)}>
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
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-semibold">
                                                            {food.patient_description || food.food?.name}
                                                        </div>
                                                        {food.patient_description && (
                                                            <span className="text-xs text-muted-foreground italic">
                                                                ({food.food?.name})
                                                            </span>
                                                        )}
                                                        {food.substitutes?.length > 0 && (
                                                            <Badge variant="outline" className="h-5 text-xs bg-green-50 text-green-700 border-green-200">
                                                                {food.substitutes.length} substitutos
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {formatQuantityWithUnit(food.quantity, food.unit, food.measure)} •
                                                        {' '}{formatNutrient(food.calories)} kcal •
                                                        P: {formatNutrient(food.protein)}g •
                                                        C: {formatNutrient(food.carbs)}g •
                                                        G: {formatNutrient(food.fat)}g
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
                                                        onClick={() => handleOpenSubstitutions(food)}
                                                        title="Gerenciar substituições"
                                                        className={food.substitutes?.length > 0 ? "text-primary bg-primary/5" : ""}
                                                    >
                                                        <ArrowRightLeft className="h-4 w-4" />
                                                    </Button>
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
                                            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 sm:gap-4">
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

                    <DialogFooter className="shrink-0 border-t pt-3">
                        <p className="mr-auto text-xs text-muted-foreground">Confirme esta refeição e salve o plano ao concluir.</p>
                        {errors.save && (
                            <p className="mr-auto text-sm text-destructive" role="alert">{errors.save}</p>
                        )}
                        <Button variant="outline" onClick={handleClose}>
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {initialData ? 'Atualizar' : 'Adicionar'} Refeição
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para adicionar/editar alimento */}
            <AddFoodToMealDialog
                ownerId={ownerId}
                shadowKey={recoveryDraft?.draft_key.includes(':food:') ? recoveryDraft.draft_key : shadowKey ? `${shadowKey}:food:${editingFood?.id || editingFood?.tempId || 'new'}` : null}
                autoRestore={Boolean(recoveryDraft?.draft_key.includes(':food:'))}
                resumeState={resumeState?.foodEditor?.open ? resumeState.foodEditor.state : null}
                session={session}
                onWorkingState={setFoodEditorState}
                draftContext={{ ...draftContext, foodId: editingFood?.id || null, mealSnapshot: { formData, foods } }}
                isOpen={showAddFood}
                onClose={handleFoodDialogClose}
                onAdd={editingFood ? handleUpdateFood : handleAddFood}
                initialData={editingFood}
                mealName={formData.meal_type === 'other' ? formData.name : mealTypes.find(t => t.value === formData.meal_type)?.label}
            />

            {/* Dialog para substituições */}
            <SubstitutionDialog
                isOpen={showSubstitutions}
                onClose={() => setShowSubstitutions(false)}
                originalFood={substitutingFood}
                initialSubstitutes={substitutingFood?.substitutes}
                onSave={handleSaveSubstitutions}
            />
        </>
    );
};

export default MealPlanMealForm;
