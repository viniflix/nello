import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Trash2, Search, Clock, MessageSquare, Save, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { translateMealType } from '@/utils/mealTranslations';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import PatientAddFoodDialog from '@/components/patient/PatientAddFoodDialog';

/**
 * AddMealPage - Nova página reformulada de registro de refeição
 *
 * Mostra alimentos recomendados do plano
 * Permite adicionar outros alimentos
 * Suporta medidas diretas e caseiras
 */
export default function AddMealPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Dados vindos da navegação
  const {
    mealType: initialMealType,
    mealTime,
    mealName,
    recommendedFoods = [],
    editMode = false,
    mealId = null
  } = location.state || {};

  // Estado da refeição
  const [mealType, setMealType] = useState(initialMealType);
  const [mealDateTime, setMealDateTime] = useState(format(new Date(), 'HH:mm')); // Sempre hora atual
  const [notes, setNotes] = useState('');
  const [addedFoods, setAddedFoods] = useState([]);
  const [loading, setLoading] = useState(false);

  // Estado do modal de adicionar/editar alimento
  const [showFoodDialog, setShowFoodDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add', 'edit', 'recommended'
  const [editingFood, setEditingFood] = useState(null);

  // Estado de submit
  const [saving, setSaving] = useState(false);

  // Carregar dados da refeição existente se estiver em modo de edição
  useEffect(() => {
    if (editMode && mealId) {
      loadExistingMeal();
    }
  }, [editMode, mealId]);

  const loadExistingMeal = async () => {
    setLoading(true);
    try {
      // Buscar dados da refeição (apenas se não foi deletada)
      const { data: mealData, error: mealError } = await supabase
        .from('meals')
        .select('*')
        .eq('id', mealId)
        .is('deleted_at', null)
        .single();

      if (mealError) throw mealError;

      // Buscar itens da refeição
      const { data: itemsData, error: itemsError } = await supabase
        .from('meal_items')
        .select('*')
        .eq('meal_id', mealId);

      if (itemsError) throw itemsError;

      // Preencher estados com dados existentes
      setMealType(mealData.meal_type);
      setMealDateTime(mealData.meal_time || format(new Date(), 'HH:mm'));
      setNotes(mealData.notes || '');

      // Buscar dados completos de cada alimento
      const foodsWithData = await Promise.all(
        itemsData.map(async (item, index) => {
          // Buscar dados originais do alimento
          const { data: foodData } = await supabase
            .from('foods')
            .select('*')
            .eq('id', item.food_id)
            .single();

          return {
            id: item.id || Date.now() + index,
            food_id: item.food_id,
            food_name: item.name,
            quantity: item.quantity,
            unit: item.unit || 'gram', // Carregar unidade salva
            measure: null, // Será preenchido se necessário
            // Usar base_* do alimento original (per 100g)
            base_calories: foodData?.calories || 0,
            base_protein: foodData?.protein || 0,
            base_carbs: foodData?.carbs || 0,
            base_fat: foodData?.fat || 0,
            // Manter valores calculados que foram salvos
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat
          };
        })
      );

      setAddedFoods(foodsWithData);
    } catch (error) {
      console.error('Erro ao carregar refeição:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados da refeição',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Buscar alimentos - função removida (honest registration: users must manually add foods)

  // Abrir modal para adicionar novo alimento
  const handleOpenAddDialog = () => {
    setEditingFood(null);
    setDialogMode('add');
    setShowFoodDialog(true);
  };

  // Abrir modal para editar alimento existente (alterar medida)
  const handleEditFood = (food) => {
    // Preparar alimento para edição no formato que o modal espera
    const foodForEdit = {
      id: food.food_id,
      name: food.food_name,
      calories: food.base_calories,
      protein: food.base_protein,
      carbs: food.base_carbs,
      fat: food.base_fat,
      // Dados atuais para pré-preencher
      quantity: food.quantity,
      unit: food.unit,
      measure: food.measure,
      notes: food.notes,
      // ID do item na lista para atualizar
      list_item_id: food.id
    };

    setEditingFood(foodForEdit);
    setDialogMode('edit');
    setShowFoodDialog(true);
  };

  // Callback quando modal adicionar/atualizar alimento
  const handleFoodDialogAdd = (foodData) => {
    if (dialogMode === 'edit' && foodData.list_item_id) {
      // Atualizar alimento existente - preservar list_item_id original
      setAddedFoods(prev => prev.map(f =>
        f.id === foodData.list_item_id ? { ...foodData, id: foodData.list_item_id } : f
      ));
    } else {
      // Adicionar novo alimento
      setAddedFoods(prev => [...prev, foodData]);
    }
  };

  // Remover alimento
  const handleRemoveFood = (id) => {
    setAddedFoods(prev => prev.filter(food => food.id !== id));
  };

  // Atualizar quantidade inline (recalcula nutrientes)
  const handleUpdateQuantity = async (id, newQuantity) => {
    const food = addedFoods.find(f => f.id === id);
    if (!food) return;

    const qty = parseFloat(newQuantity);
    if (isNaN(qty) || qty <= 0) return;

    // Recalcular nutrientes
    const { calculateNutrition } = await import('@/lib/supabase/meal-plan-queries');
    const foodData = {
      calories: food.base_calories,
      protein: food.base_protein,
      carbs: food.base_carbs,
      fat: food.base_fat
    };

    const nutrition = await calculateNutrition(foodData, qty, food.unit);

    setAddedFoods(prev => prev.map(f => {
      if (f.id === id) {
        return {
          ...f,
          quantity: qty,
          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat
        };
      }
      return f;
    }));
  };

  // Calcular totais
  const totals = addedFoods.reduce((acc, food) => ({
    calories: acc.calories + (parseFloat(food.calories) || 0),
    protein: acc.protein + (parseFloat(food.protein) || 0),
    carbs: acc.carbs + (parseFloat(food.carbs) || 0),
    fat: acc.fat + (parseFloat(food.fat) || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Salvar refeição
  const handleSave = async () => {
    if (addedFoods.length === 0) {
      toast({
        title: 'Erro',
        description: 'Adicione pelo menos um alimento',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      if (editMode && mealId) {
        // MODO DE EDIÇÃO - Atualizar refeição existente

        // Atualizar dados da refeição
        const { error: mealError } = await supabase
          .from('meals')
          .update({
            meal_type: mealType,
            meal_time: mealDateTime,
            notes: notes,
            total_calories: totals.calories,
            total_protein: totals.protein,
            total_carbs: totals.carbs,
            total_fat: totals.fat
          })
          .eq('id', mealId);

        if (mealError) throw mealError;

        // Deletar itens antigos
        const { error: deleteError } = await supabase
          .from('meal_items')
          .delete()
          .eq('meal_id', mealId);

        if (deleteError) throw deleteError;

        // Inserir novos itens
        const mealItems = addedFoods.map(food => ({
          meal_id: mealId,
          food_id: food.food_id,
          name: food.food_name,
          quantity: parseFloat(food.quantity) || 0,
          unit: food.unit || 'gram',
          calories: parseFloat(food.calories) || 0,
          protein: parseFloat(food.protein) || 0,
          carbs: parseFloat(food.carbs) || 0,
          fat: parseFloat(food.fat) || 0
        }));

        const { error: itemsError } = await supabase
          .from('meal_items')
          .insert(mealItems);

        if (itemsError) throw itemsError;

        // =====================================================
        // AUDITORIA: Registrar ação de UPDATE
        // =====================================================
        // IMPORTANTE PARA MÓDULO FUTURO:
        // - Feed mostrará "Paciente X editou Café da Manhã"
        // - Timeline exibirá diff: alterações em alimentos, quantidades
        // - Histórico completo de versões da refeição
        await supabase.rpc('log_meal_action', {
          p_patient_id: user.id,
          p_meal_id: mealId,
          p_action: 'update',
          p_meal_type: mealType,
          p_meal_date: format(new Date(), 'yyyy-MM-dd'),
          p_meal_time: mealDateTime,
          p_details: {
            total_calories: totals.calories,
            total_protein: totals.protein,
            total_carbs: totals.carbs,
            total_fat: totals.fat,
            items: addedFoods.map(f => ({
              food_id: f.food_id,
              name: f.food_name,
              quantity: f.quantity,
              unit: f.unit
            }))
          }
        });

        toast({
          title: 'Sucesso!',
          description: 'Refeição atualizada com sucesso'
        });
      } else {
        // MODO DE CRIAÇÃO - Criar nova refeição

        const { data: meal, error: mealError } = await supabase
          .from('meals')
          .insert({
            patient_id: user.id,
            meal_type: mealType,
            meal_date: today,
            meal_time: mealDateTime,
            notes: notes,
            total_calories: totals.calories,
            total_protein: totals.protein,
            total_carbs: totals.carbs,
            total_fat: totals.fat
          })
          .select()
          .single();

        if (mealError) throw mealError;

        // Adicionar itens da refeição
        const mealItems = addedFoods.map(food => ({
          meal_id: meal.id,
          food_id: food.food_id,
          name: food.food_name,
          quantity: parseFloat(food.quantity) || 0,
          unit: food.unit || 'gram',
          calories: parseFloat(food.calories) || 0,
          protein: parseFloat(food.protein) || 0,
          carbs: parseFloat(food.carbs) || 0,
          fat: parseFloat(food.fat) || 0
        }));

        const { error: itemsError } = await supabase
          .from('meal_items')
          .insert(mealItems);

        if (itemsError) throw itemsError;

        // =====================================================
        // AUDITORIA: Registrar ação de CREATE
        // =====================================================
        // IMPORTANTE PARA MÓDULO FUTURO:
        // - Feed mostrará "Paciente X registrou Café da Manhã"
        // - Dashboard do nutricionista exibe atividade em tempo real
        // - Notificação push/email para nutricionista (se configurado)
        await supabase.rpc('log_meal_action', {
          p_patient_id: user.id,
          p_meal_id: meal.id,
          p_action: 'create',
          p_meal_type: mealType,
          p_meal_date: today,
          p_meal_time: mealDateTime,
          p_details: {
            total_calories: totals.calories,
            total_protein: totals.protein,
            total_carbs: totals.carbs,
            total_fat: totals.fat,
            items: addedFoods.map(f => ({
              food_id: f.food_id,
              name: f.food_name,
              quantity: f.quantity,
              unit: f.unit
            }))
          }
        });

        toast({
          title: 'Sucesso!',
          description: 'Refeição registrada com sucesso'
        });
      }

      navigate('/patient/diario');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a refeição',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Loading state para modo de edição
  if (editMode && loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Carregando dados da refeição...</p>
        </div>
      </div>
    );
  }

  // Validação de mealType
  if (!mealType && !editMode) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Tipo de refeição não especificado</p>
          <Button onClick={() => navigate('/patient/diario')}>
            Voltar ao Plano Alimentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/patient/diario')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {editMode ? 'Editar' : 'Registrar'} {translateMealType(mealType)}
            </h1>
            <p className="text-muted-foreground mt-1">
              {editMode ? 'Atualize os alimentos da refeição' : 'Adicione os alimentos consumidos'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Alimentos Recomendados - READ ONLY REFERENCE */}
            {recommendedFoods && recommendedFoods.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Refeição Planejada</CardTitle>
                  <CardDescription>
                    Visualize sua meta abaixo e busque os alimentos manualmente para registrar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900 font-medium">
                      💡 Visualize sua meta abaixo e busque os alimentos manualmente para registrar.
                    </p>
                  </div>
                  {recommendedFoods.map((food, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted border border-border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm text-foreground">{food.foods?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatQuantityWithUnit(food.quantity, food.unit, food.measure)}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Buscar e Adicionar Alimentos */}
            <Card>
              <CardHeader>
                <CardTitle>Adicionar Alimentos</CardTitle>
                <CardDescription>
                  Busque e adicione outros alimentos usando medidas caseiras
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleOpenAddDialog} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Buscar Alimento
                </Button>
              </CardContent>
            </Card>

            {/* Alimentos Adicionados */}
            <Card>
              <CardHeader>
                <CardTitle>Alimentos Adicionados</CardTitle>
                <CardDescription>
                  Configure as quantidades
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {addedFoods.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum alimento adicionado ainda
                  </p>
                ) : (
                  addedFoods.map(food => (
                    <div key={food.id} className="border rounded-lg p-4 space-y-3">
                      {/* Cabeçalho */}
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{food.food_name}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFood(food.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>

                      {/* Edição inline de quantidade */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Quantidade</Label>
                          <Input
                            type="number"
                            value={food.quantity}
                            onChange={(e) => handleUpdateQuantity(food.id, e.target.value)}
                            step="0.1"
                            min="0"
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Medida</Label>
                          <div className="h-9 px-3 border rounded-md flex items-center bg-muted text-sm">
                            {formatQuantityWithUnit(1, food.unit, food.measure).replace(/^\d+\s*/, '')}
                          </div>
                        </div>
                      </div>

                      {/* Nutrientes */}
                      <div className="text-xs text-muted-foreground">
                        {food.calories.toFixed(1)} kcal • P: {food.protein.toFixed(1)}g • C: {food.carbs.toFixed(1)}g • G: {food.fat.toFixed(1)}g
                      </div>

                      {/* Botão para editar medida completa */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleEditFood(food)}
                      >
                        Alterar Medida
                      </Button>

                      {food.notes && (
                        <p className="text-xs text-muted-foreground italic">
                          {food.notes}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Coluna lateral - Resumo */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Resumo da Refeição</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Horário */}
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4" />
                    Horário
                  </Label>
                  <TimeInput
                    value={mealDateTime}
                    onChange={(value) => setMealDateTime(value)}
                  />
                </div>

                {/* Observações */}
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4" />
                    Observações
                  </Label>
                  <Textarea
                    placeholder="Adicione comentários sobre esta refeição..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Totais Nutricionais */}
                <div className="space-y-2 pt-4 border-t">
                  <h4 className="font-semibold text-sm">Totais Nutricionais</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-primary/5 rounded-lg">
                      <p className="text-2xl font-bold text-primary">
                        {Math.round(totals.calories)}
                      </p>
                      <p className="text-xs text-muted-foreground">Calorias</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-lg font-bold text-blue-600">
                        {Math.round(totals.protein)}g
                      </p>
                      <p className="text-xs text-muted-foreground">Proteínas</p>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                      <p className="text-lg font-bold text-orange-600">
                        {Math.round(totals.carbs)}g
                      </p>
                      <p className="text-xs text-muted-foreground">Carboidratos</p>
                    </div>
                    <div className="text-center p-3 bg-amber-50 rounded-lg">
                      <p className="text-lg font-bold text-amber-600">
                        {Math.round(totals.fat)}g
                      </p>
                      <p className="text-xs text-muted-foreground">Gorduras</p>
                    </div>
                  </div>
                </div>

                {/* Botão Salvar */}
                <Button
                  className="w-full"
                  onClick={handleSave}
                  disabled={saving || addedFoods.length === 0}
                >
                  {saving ? (
                    <>{editMode ? 'Atualizando...' : 'Salvando...'}</>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {editMode ? 'Atualizar Refeição' : 'Salvar Refeição'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal de Adicionar/Editar Alimento */}
      <PatientAddFoodDialog
        isOpen={showFoodDialog}
        onClose={() => setShowFoodDialog(false)}
        onAdd={handleFoodDialogAdd}
        initialFood={editingFood}
        mode={dialogMode}
      />
    </div>
  );
}
