import React, { useState, useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import FoodSelector from './FoodSelector';
import { PremiumPortionSelector } from '@/components/nutrition';
import { isGramUnit } from '@/lib/utils/foodPortions';
import { formatNutrient } from '@/lib/utils';
import { useShadowDraft } from '@/hooks/useShadowDraft';
import { ShadowRecovery, ShadowSaveStatus } from '@/components/ui/shadow-save-status';

const AddFoodToMealDialog = ({ isOpen, onClose, onAdd, mealName, initialData = null, ownerId, shadowKey, autoRestore = false, draftContext = null, resumeState = null, onWorkingState, session = null }) => {
    const [selectedFood, setSelectedFood] = useState(null);
    const [portion, setPortion] = useState({ quantity: '', measureId: null, measureCode: 'gram' });
    const [notes, setNotes] = useState('');
    const [patientDescription, setPatientDescription] = useState('');
    const [calculatedNutrition, setCalculatedNutrition] = useState(null);
    const searchInputRef = useRef(null);
    const [errors, setErrors] = useState({});
    const [isApplying, setIsApplying] = useState(false);
    const touchedRef = useRef(false);
    const recoveryOpenedRef = useRef(false);
    const sessionRestoredRef = useRef(false);
    const shadow = useShadowDraft({ ownerId, draftKey: shadowKey, enabled: isOpen && Boolean(ownerId && shadowKey) });
    const contextJson = JSON.stringify(draftContext);
    useEffect(() => {
        if (!session && isOpen && shadow.ready && touchedRef.current) {
            shadow.queue({ selectedFood, portion, notes, patientDescription, calculatedNutrition, context: JSON.parse(contextJson) });
        }
    }, [isOpen, shadow.ready, shadow.queue, selectedFood, portion, notes, patientDescription, calculatedNutrition, contextJson, session]);
    useEffect(() => {
        if (autoRestore && shadow.ready && shadow.recovery && !recoveryOpenedRef.current) {
            recoveryOpenedRef.current = true;
            restoreShadow();
        }
    // Explicitly selected recovery should reopen this editor once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRestore, shadow.ready, shadow.recovery]);
    const restoreShadow = () => {
        const value = shadow.restore();
        if (!value) return;
        touchedRef.current = true;
        setSelectedFood(value.selectedFood || null);
        setPortion(value.portion || { quantity: 100, measureId: null, measureCode: 'gram' });
        setNotes(value.notes || '');
        setPatientDescription(value.patientDescription || '');
        setCalculatedNutrition(value.calculatedNutrition || null);
    };

    // Popular campos quando está editando
    useEffect(() => {
        if (initialData) {
            setSelectedFood(initialData.food);
            // Suporta legado (unit numérico) e novo formato (unit = code string)
            const unitCode = isGramUnit(initialData.unit)
                ? 'gram'
                : initialData.unit;
            setPortion({
                quantity: initialData.quantity ?? 100,
                measureId: unitCode,
                measureCode: unitCode,
                measure: initialData.measure || null
            });
            setNotes(initialData.notes || '');
            setPatientDescription(initialData.patient_description || '');
            setCalculatedNutrition({
                calories: initialData.calories || 0,
                protein: initialData.protein || 0,
                carbs: initialData.carbs || 0,
                fat: initialData.fat || 0
            });
        }
    }, [initialData]);

    useEffect(() => {
        if (!isOpen || !resumeState || sessionRestoredRef.current) return;
        sessionRestoredRef.current = true;
        setSelectedFood(resumeState.selectedFood || null);
        setPortion(resumeState.portion || { quantity: 100, measureId: null, measureCode: 'gram' });
        setNotes(resumeState.notes || '');
        setPatientDescription(resumeState.patientDescription || '');
        setCalculatedNutrition(resumeState.calculatedNutrition || null);
    }, [isOpen, resumeState]);
    const editorJson = JSON.stringify({ selectedFood, portion, notes, patientDescription, calculatedNutrition });
    useEffect(() => { if (isOpen) onWorkingState?.(JSON.parse(editorJson)); }, [isOpen, onWorkingState, editorJson]);

    const handleFoodSelect = (food) => {
        if (selectedFood?.id === food.id) return;
        touchedRef.current = true;
        setSelectedFood(food);
        // Resetar porção ao trocar alimento
        setPortion({ quantity: '', measureId: null, measureCode: 'gram', measure: null });
        setCalculatedNutrition(null);
    };

    // Receber nutrição calculada do PortionSelector (fonte única de verdade)
    const handleNutritionChange = (nutrition) => {
        touchedRef.current = true;
        setCalculatedNutrition(nutrition);
    };

    const validate = () => {
        const newErrors = {};

        if (!selectedFood) {
            newErrors.food = 'Selecione um alimento';
        }

        if (portion.quantity === '' || !Number.isFinite(Number(portion.quantity)) || Number(portion.quantity) < 0) {
            newErrors.portion = 'Informe uma quantidade maior ou igual a zero';
        }
        if (!calculatedNutrition) {
            newErrors.portion = 'Aguarde a medida carregar ou selecione uma medida válida';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAdd = async (continueAdding = false) => {
        if (isApplying) return;
        if (!validate()) return;

        const unitCode = portion.measureCode || portion.measureId || 'gram';
        const foodData = {
            food_id: selectedFood.id,
            food: selectedFood,
            quantity: portion.quantity,
            unit: unitCode,
            measure: portion.measure || null,
            grams: calculatedNutrition?.grams,
            calories: calculatedNutrition?.calories || 0,
            protein: calculatedNutrition?.protein || 0,
            carbs: calculatedNutrition?.carbs || 0,
            fat: calculatedNutrition?.fat || 0,
            notes: notes.trim() || null,
            patient_description: patientDescription.trim() || null
        };

        setIsApplying(true);
        try {
            const saved = await onAdd(foodData);
            if (saved === false) throw new Error('Não foi possível adicionar o alimento.');
            await shadow.discard();
            if (continueAdding) {
                setSelectedFood(null);
                setPortion({ quantity: '', measureId: null, measureCode: 'gram', measure: null });
                setNotes('');
                setPatientDescription('');
                setCalculatedNutrition(null);
                setErrors({});
                searchInputRef.current?.focus();
            } else await handleClose();
        } catch {
            setErrors((current) => ({ ...current, save: 'Não foi possível adicionar o alimento. O rascunho foi mantido.' }));
        } finally {
            setIsApplying(false);
        }
    };

    const handleClose = async () => {
        if (session && ['local', 'saving', 'error', 'conflict'].includes(session.status) && !(await session.flush())) return;
        if (!session && touchedRef.current && ['local', 'saving', 'error', 'conflict'].includes(shadow.status) && !(await shadow.flush())) return;
        touchedRef.current = false;
        setSelectedFood(null);
        setPortion({ quantity: '', measureId: null, measureCode: 'gram', measure: null });
        setNotes('');
        setPatientDescription('');
        setCalculatedNutrition(null);
        setErrors({});
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="flex h-[92dvh] max-h-[calc(100dvh-1rem)] w-[96vw] max-w-[1440px] flex-col gap-4 overflow-hidden">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{initialData ? 'Editar Alimento' : 'Adicionar Alimento'}</DialogTitle>
                    <DialogDescription>{mealName ? 'Refeição: ' + mealName + '. ' : ''}Busque o alimento, informe a quantidade e escolha a medida.</DialogDescription>
                </DialogHeader>
                {ownerId && shadowKey && <div className="shrink-0 space-y-2">
                    {session?.recovery && session.reopen && <ShadowRecovery recovery={session.recovery} onRestore={() => { void session.reopen(); }} onDiscard={() => { void session.discardRecovery(); }} />}
                    {!resumeState && <ShadowRecovery recovery={shadow.recovery} onRestore={restoreShadow} onDiscard={() => { void shadow.discardRecovery(); }} />}
                    <ShadowSaveStatus status={session?.status || shadow.status} onRetry={session?.flush || shadow.flush} />
                </div>}
                <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:overflow-hidden">
                    <div className="min-h-[360px] min-w-0 lg:min-h-0">
                        <FoodSelector embedded isOpen={isOpen} onClose={() => {}} onSelect={handleFoodSelect} searchInputRef={searchInputRef} selectedFoodId={selectedFood?.id} />
                    </div>
                    <div className="min-w-0 space-y-4 rounded-xl border bg-muted/20 p-4 lg:overflow-y-auto">
                        <div className="space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alimento selecionado</span>
                            {selectedFood ? <div className="space-y-1"><h3 className="text-lg font-semibold leading-snug">{selectedFood.name}</h3><p className="text-xs text-muted-foreground">{selectedFood.source}{selectedFood.group ? ' · ' + selectedFood.group : ''}</p><Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => searchInputRef.current?.focus()}>Trocar alimento na busca</Button></div> : <div className="rounded-lg border border-dashed p-4"><p className="text-sm text-muted-foreground">Selecione um resultado da busca para definir a porção.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => searchInputRef.current?.focus()}>Buscar Alimento</Button></div>}
                            {errors.food && <p role="alert" className="text-xs text-destructive">{errors.food}</p>}
                        </div>
                        <PremiumPortionSelector focusQuantityOnSelect food={selectedFood} value={portion} onChange={value => { touchedRef.current = true; setPortion(value); }} onNutritionChange={handleNutritionChange} showNutrition={false} />
                        {errors.portion && <p role="alert" className="text-xs text-destructive">{errors.portion}</p>}
                        {calculatedNutrition && portion.quantity !== '' && <Alert className="bg-background"><AlertDescription><p className="mb-2 font-semibold">Nesta porção</p><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['Calorias',calculatedNutrition.calories,'kcal'],['Proteínas',calculatedNutrition.protein,'g'],['Carboidratos',calculatedNutrition.carbs,'g'],['Gorduras',calculatedNutrition.fat,'g']].map(([label,value,unit]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{formatNutrient(Math.round(value || 0))} {unit}</p></div>)}</div></AlertDescription></Alert>}
                        <div className="space-y-2"><Label htmlFor="patientDescription">Descrição para o paciente</Label><Textarea id="patientDescription" rows={2} placeholder={selectedFood?.name || 'Nome que será exibido no plano (opcional)'} value={patientDescription} onChange={e => { touchedRef.current = true; setPatientDescription(e.target.value); }} /><p className="text-xs text-muted-foreground">Deixe vazio para usar o nome do alimento.</p></div>
                        <div className="space-y-2"><Label htmlFor="food-notes">Observações (opcional)</Label><Textarea id="food-notes" rows={2} placeholder="Preparo, temperos ou orientação para este alimento" value={notes} onChange={e => { touchedRef.current = true; setNotes(e.target.value); }} /></div>
                    </div>
                </div>
                <DialogFooter className="shrink-0 flex-wrap items-center border-t pt-3">
                    {errors.save && <p role="alert" className="w-full text-xs text-destructive">{errors.save}</p>}
                    <p className="mr-auto text-xs text-muted-foreground">O alimento entra nesta refeição. Salve o plano ao concluir.</p>
                    <Button type="button" variant="outline" onClick={handleClose} disabled={isApplying}><X className="mr-2 h-4 w-4" />Cancelar</Button>
                    {!initialData && <Button type="button" variant="outline" onClick={() => handleAdd(true)} disabled={isApplying || !selectedFood || portion.quantity === ''}>Adicionar e continuar</Button>}
                    <Button type="button" onClick={() => handleAdd()} disabled={isApplying || !selectedFood || portion.quantity === ''}><Plus className="mr-2 h-4 w-4" />{initialData ? 'Atualizar' : 'Adicionar'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AddFoodToMealDialog;
