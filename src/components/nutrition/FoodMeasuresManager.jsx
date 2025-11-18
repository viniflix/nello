/**
 * FoodMeasuresManager - Gerenciador de medidas caseiras
 * Permite nutricionistas cadastrar, editar e remover medidas caseiras de alimentos
 * REQUER: Usuário com role 'nutritionist'
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, Plus, Edit2 } from 'lucide-react';
import { useFoodMeasures, useCreateFoodMeasure, useUpdateFoodMeasure, useDeleteFoodMeasure } from '@/hooks/useFoodMeasures';
import { useHouseholdMeasures } from '@/hooks/useHouseholdMeasures';

/**
 * @param {object} props
 * @param {number} props.foodId - ID do alimento
 * @param {string} props.foodName - Nome do alimento (para exibição)
 */
export function FoodMeasuresManager({ foodId, foodName }) {
    // Buscar medidas cadastradas
    const { data: foodMeasures = [], isLoading: loadingMeasures, refetch } = useFoodMeasures(foodId);

    // Buscar medidas genéricas disponíveis
    const { data: allMeasures = [], isLoading: loadingAll } = useHouseholdMeasures();

    // Mutations
    const createMutation = useCreateFoodMeasure();
    const updateMutation = useUpdateFoodMeasure();
    const deleteMutation = useDeleteFoodMeasure();

    // Estado do formulário
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const [formData, setFormData] = useState({
        measure_id: '',
        quantity: 1,
        grams: ''
    });

    const handleAdd = async () => {
        if (!formData.measure_id || !formData.grams) {
            return;
        }

        await createMutation.mutateAsync({
            food_id: foodId,
            measure_id: parseInt(formData.measure_id),
            quantity: parseFloat(formData.quantity),
            grams: parseFloat(formData.grams)
        });

        // Resetar formulário e recarregar medidas
        setIsAdding(false);
        setFormData({ measure_id: '', quantity: 1, grams: '' });
        refetch();
    };

    const handleUpdate = async (measureId) => {
        if (!formData.grams) return;

        await updateMutation.mutateAsync({
            id: measureId,
            payload: {
                quantity: parseFloat(formData.quantity),
                grams: parseFloat(formData.grams)
            }
        });

        setEditingId(null);
        setFormData({ measure_id: '', quantity: 1, grams: '' });
        refetch();
    };

    const handleDelete = async (measureId) => {
        await deleteMutation.mutateAsync(measureId);
        setDeleteConfirm(null);
        refetch();
    };

    const startEdit = (measure) => {
        setEditingId(measure.id);
        setFormData({
            measure_id: measure.measure_id.toString(),
            quantity: measure.quantity,
            grams: measure.grams.toString()
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setFormData({ measure_id: '', quantity: 1, grams: '' });
    };

    const getMeasureName = (measureId) => {
        const measure = allMeasures.find(m => m.id === measureId);
        return measure?.name || 'Desconhecida';
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">
                    Medidas Caseiras - {foodName}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Lista de medidas cadastradas */}
                <div className="space-y-2">
                    {loadingMeasures ? (
                        <p className="text-sm text-muted-foreground">Carregando...</p>
                    ) : foodMeasures.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Nenhuma medida caseira cadastrada para este alimento
                        </p>
                    ) : (
                        foodMeasures.map((fm) => (
                            <div
                                key={fm.id}
                                className="flex items-center justify-between p-3 border rounded-lg"
                            >
                                {editingId === fm.id ? (
                                    // Modo edição
                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                        <Input
                                            type="number"
                                            value={formData.quantity}
                                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                            min={0.1}
                                            step={0.5}
                                            placeholder="Qtd"
                                        />
                                        <span className="flex items-center text-sm">
                                            {fm.measure.name}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={formData.grams}
                                                onChange={(e) => setFormData({ ...formData, grams: e.target.value })}
                                                min={0}
                                                placeholder="Gramas"
                                            />
                                            <span className="text-sm">g</span>
                                        </div>
                                    </div>
                                ) : (
                                    // Modo visualização
                                    <span className="text-sm">
                                        <strong>{fm.quantity}</strong> {fm.measure.name} = <strong>{fm.grams}g</strong>
                                        {fm.measure.description && (
                                            <span className="text-muted-foreground ml-2">
                                                ({fm.measure.description})
                                            </span>
                                        )}
                                    </span>
                                )}

                                <div className="flex gap-2 ml-4">
                                    {editingId === fm.id ? (
                                        <>
                                            <Button
                                                size="sm"
                                                onClick={() => handleUpdate(fm.id)}
                                                disabled={updateMutation.isPending}
                                            >
                                                Salvar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={cancelEdit}
                                            >
                                                Cancelar
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => startEdit(fm)}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setDeleteConfirm(fm.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Botão adicionar */}
                {!isAdding && !editingId && (
                    <Button onClick={() => setIsAdding(true)} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar Medida Caseira
                    </Button>
                )}

                {/* Formulário de adicionar */}
                {isAdding && (
                    <div className="space-y-4 border p-4 rounded-lg bg-muted/50">
                        <div className="space-y-2">
                            <Label>Medida</Label>
                            <Select
                                value={formData.measure_id}
                                onValueChange={(val) => setFormData({ ...formData, measure_id: val })}
                                disabled={loadingAll}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a medida" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {allMeasures.map((m) => (
                                        <SelectItem key={m.id} value={m.id.toString()}>
                                            <div className="flex flex-col">
                                                <span>{m.name}</span>
                                                {m.description && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {m.description}
                                                    </span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Quantidade</Label>
                                <Input
                                    type="number"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                    min={0.1}
                                    step={0.5}
                                    placeholder="Ex: 1"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Peso em gramas</Label>
                                <Input
                                    type="number"
                                    value={formData.grams}
                                    onChange={(e) => setFormData({ ...formData, grams: e.target.value })}
                                    min={0}
                                    placeholder="Ex: 180"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleAdd}
                                disabled={createMutation.isPending || !formData.measure_id || !formData.grams}
                            >
                                Salvar
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsAdding(false);
                                    setFormData({ measure_id: '', quantity: 1, grams: '' });
                                }}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}

                {/* Dialog de confirmação de exclusão */}
                <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja remover esta medida caseira?
                                Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => handleDelete(deleteConfirm)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Remover
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}

export default FoodMeasuresManager;
