import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTemplateBuilder } from '@/hooks/useTemplateBuilder';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft, Save, Plus, FileText, Coffee, UtensilsCrossed,
  Trash2, Edit2, Loader2, Tag, X, Clock, ChefHat
} from 'lucide-react';
import AddFoodToMealDialog from '@/components/meal-plan/AddFoodToMealDialog';

export default function TemplateBuilder() {
  const { type, id } = useParams(); // /new/:type  ou  /edit/:type/:id
  const navigate = useNavigate();
  const { toast } = useToast();
  const { formData, setFormData, handleSave, loading, isLoadingTemplate, isEditMode } = useTemplateBuilder(type, id || null);

  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false);
  const [activeMealIndex, setActiveMealIndex] = useState(null);
  const [editingFood, setEditingFood] = useState(null); // { mealIndex, foodIndex } | null
  // Tags: estado raw separado para evitar bug da vírgula
  const [tagsRaw, setTagsRaw] = useState('');

  // ─── Validação de formulário ─────────────────────────────────────────────────
  const validate = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe um nome para o template.', variant: 'destructive' });
      return false;
    }
    if (formData.name.trim().length > 100) {
      toast({ title: 'Nome muito longo', description: 'Máximo de 100 caracteres.', variant: 'destructive' });
      return false;
    }
    
    if (type === 'diet') {
      if (formData.meals.length === 0) {
        toast({ title: 'Adicione pelo menos uma refeição', description: 'Uma dieta precisa ter ao menos 1 refeição.', variant: 'destructive' });
        return false;
      }
      const hasEmptyMeal = formData.meals.some(m => !m.name.trim());
      if (hasEmptyMeal) {
        toast({ title: 'Refeição sem nome', description: 'Dê um nome para todas as refeições.', variant: 'destructive' });
        return false;
      }
    } else if (type === 'meal') {
      if (formData.foods.length === 0) {
        toast({ title: 'Refeição vazia', description: 'Adicione ao menos um alimento.', variant: 'destructive' });
        return false;
      }
    } else if (type === 'recipe') {
      if (formData.ingredients.length === 0) {
        toast({ title: 'Receita sem ingredientes', description: 'Adicione ao menos um ingrediente.', variant: 'destructive' });
        return false;
      }
      if (!formData.yield_quantity || formData.yield_quantity <= 0) {
        toast({ title: 'Rendimento inválido', description: 'Informe a quantidade de rendimento.', variant: 'destructive' });
        return false;
      }
    }

    const longTag = formData.tags.find(t => t.length > 30);
    if (longTag) {
      toast({ title: 'Tag muito longa', description: `"${longTag}" excede 30 caracteres.`, variant: 'destructive' });
      return false;
    }
    if (formData.tags.length > 10) {
      toast({ title: 'Muitas tags', description: 'Máximo de 10 tags por template.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  // Sincronizar tagsRaw quando formData.tags carrega (modo edição)
  useEffect(() => {
    if (formData.tags.length > 0) {
      setTagsRaw(formData.tags.join(', '));
    }
  }, [formData.tags.length]);

  const getTitle = () => {
    const label = { diet: 'Dieta Padrão', meal: 'Refeição', recipe: 'Receita' }[type] || 'Template';
    return isEditMode ? `Editar ${label}` : `Nova ${label}`;
  };

  const getIcon = () => {
    const icons = {
      diet: <FileText className="w-5 h-5 text-primary" />,
      meal: <Coffee className="w-5 h-5 text-primary" />,
      recipe: <UtensilsCrossed className="w-5 h-5 text-primary" />,
    };
    return icons[type] || null;
  };

  // ─── Tags handlers ─────────────────────────────────────────────────────────

  const parseTagsFromRaw = (raw) => {
    return raw
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
  };

  const handleTagsBlur = () => {
    const parsed = parseTagsFromRaw(tagsRaw);
    setFormData(prev => ({ ...prev, tags: [...new Set(parsed)] }));
    // Limpar raw após confirmar
    setTagsRaw(parsed.join(', '));
  };

  const handleTagsKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleTagsBlur();
    }
  };

  const handleTagsChange = (val) => {
    // Se a última letra digitada for uma vírgula, confirma a tag imediatamente
    if (val.endsWith(',')) {
      const parsed = parseTagsFromRaw(val);
      setFormData(prev => ({ ...prev, tags: [...new Set([...prev.tags, ...parsed])] }));
      setTagsRaw('');
    } else {
      setTagsRaw(val);
    }
  };

  const removeTag = (idx) => {
    setFormData(prev => {
      const newTags = prev.tags.filter((_, i) => i !== idx);
      setTagsRaw(newTags.join(', '));
      return { ...prev, tags: newTags };
    });
  };

  // ─── Meals handlers ────────────────────────────────────────────────────────

  const handleAddMeal = () => {
    setFormData(prev => ({
      ...prev,
      meals: [...prev.meals, { name: `Refeição ${prev.meals.length + 1}`, time: '12:00', foods: [] }],
    }));
  };

  const handleRemoveMeal = (idx) => {
    setFormData(prev => ({ ...prev, meals: prev.meals.filter((_, i) => i !== idx) }));
  };

  // ─── Food handlers ─────────────────────────────────────────────────────────

  const handleOpenAddFood = (mealIndex = null) => {
    setActiveMealIndex(mealIndex);
    setEditingFood(null);
    setIsAddFoodOpen(true);
  };

  const handleOpenEditFood = (mealIndex, foodIndex) => {
    setActiveMealIndex(mealIndex);
    setEditingFood({ mealIndex, foodIndex });
    setIsAddFoodOpen(true);
  };

  const getEditingFoodInitialData = () => {
    if (!editingFood) return null;
    const { mealIndex, foodIndex } = editingFood;
    const food = type === 'diet'
      ? formData.meals[mealIndex]?.foods[foodIndex]
      : (type === 'meal' ? formData.foods[foodIndex] : formData.ingredients[foodIndex]);
    if (!food) return null;
    return {
      food: food.food || { id: food.food_id, name: food.name },
      quantity: food.quantity,
      unit: food.unit,
      measure: food.measure || null,
      notes: food.observation || '',
    };
  };

  const handleAddFoodConfirm = (foodData) => {
    const newFood = {
      ...(editingFood ? getEditingFoodInitialData() : {}),
      food_id: foodData.food.id,
      name: foodData.food.name,
      food: foodData.food,
      quantity: foodData.quantity,
      unit: foodData.unit,
      measure: foodData.measure,
      observation: foodData.notes || '',
    };

    if (type === 'diet') {
      setFormData(prev => {
        const newMeals = [...prev.meals];
        if (editingFood !== null) {
          newMeals[editingFood.mealIndex].foods[editingFood.foodIndex] = {
            ...newMeals[editingFood.mealIndex].foods[editingFood.foodIndex],
            ...newFood,
          };
        } else {
          newMeals[activeMealIndex].foods.push(newFood);
        }
        return { ...prev, meals: newMeals };
      });
    } else if (type === 'meal') {
      setFormData(prev => {
        if (editingFood !== null) {
          const newFoods = [...prev.foods];
          newFoods[editingFood.foodIndex] = { ...newFoods[editingFood.foodIndex], ...newFood };
          return { ...prev, foods: newFoods };
        }
        return { ...prev, foods: [...prev.foods, newFood] };
      });
    } else if (type === 'recipe') {
      setFormData(prev => {
        if (editingFood !== null) {
          const newIngs = [...prev.ingredients];
          newIngs[editingFood.foodIndex] = { ...newIngs[editingFood.foodIndex], ...newFood };
          return { ...prev, ingredients: newIngs };
        }
        return { ...prev, ingredients: [...prev.ingredients, newFood] };
      });
    }

    setIsAddFoodOpen(false);
    setActiveMealIndex(null);
    setEditingFood(null);
  };

  const handleRemoveFood = (mealIndex, foodIndex) => {
    if (type === 'diet') {
      setFormData(prev => {
        const newMeals = [...prev.meals];
        newMeals[mealIndex].foods = newMeals[mealIndex].foods.filter((_, i) => i !== foodIndex);
        return { ...prev, meals: newMeals };
      });
    } else if (type === 'meal') {
      setFormData(prev => ({ ...prev, foods: prev.foods.filter((_, i) => i !== foodIndex) }));
    } else if (type === 'recipe') {
      setFormData(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== foodIndex) }));
    }
  };

  const formatFoodUnit = (food) => {
    if (food.unit === 'gram' || !food.unit) return `${food.quantity}g`;
    if (food.measure?.label) return `${food.quantity} ${food.measure.label}`;
    return `${food.quantity} ${food.unit}`;
  };

  // ─── Loading template ──────────────────────────────────────────────────────

  if (isLoadingTemplate) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Carregando template...</p>
        </div>
      </div>
    );
  }

  const foodList = type === 'meal' ? formData.foods : formData.ingredients;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <main className="mx-auto w-full max-w-5xl min-w-0 px-4 pt-4 pb-8 md:px-8 md:pt-8">
      <Helmet>
        <title>{getTitle()} - Nello</title>
      </Helmet>

      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between md:mb-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate('/nutritionist/templates')}
            className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">{getIcon()}</div>
            <div className="min-w-0">
              <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-primary break-words md:text-3xl">{getTitle()}</h1>
              <p className="text-neutral-600 text-sm md:text-base">
                {isEditMode ? 'Edite os dados do template e salve as alterações.' : 'Configure os dados do seu novo template.'}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => { if (validate()) handleSave(); }}
          disabled={loading}
          className="w-full justify-center bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-colors font-medium disabled:opacity-50 sm:w-auto sm:shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{loading ? 'Salvando...' : (isEditMode ? 'Salvar Alterações' : 'Salvar Template')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna Esquerda: Meta Dados */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card rounded-xl shadow-sm border border-border p-5">
            <h3 className="font-semibold text-foreground mb-4">Informações Básicas</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome do Template *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Ex: Dieta Hipertrofia Masculina"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Descreva o propósito deste template..."
                />
              </div>

              {/* Tags com chips — fix do bug da vírgula */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  <Tag className="w-3.5 h-3.5 inline mr-1 text-muted-foreground" />
                  Tags
                </label>

                {/* Chips das tags confirmadas */}
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formData.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 text-xs rounded-full font-medium"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(i)}
                          className="text-primary hover:text-primary transition-colors leading-none"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  value={tagsRaw}
                  onChange={(e) => handleTagsChange(e.target.value)}
                  onBlur={handleTagsBlur}
                  onKeyDown={handleTagsKeyDown}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                  placeholder="hipertrofia, sem-lactose, vegano"
                />
                <p className="text-xs text-muted-foreground mt-1">Separe com vírgula e pressione Enter para confirmar</p>
              </div>

              {type === 'recipe' && (
                <div className="pt-4 border-t border-border">
                  <h3 className="font-semibold text-foreground mb-3">Rendimento</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-foreground mb-1">Quantidade</label>
                      <input
                        type="number"
                        value={formData.yield_quantity}
                        onChange={(e) => setFormData(prev => ({ ...prev, yield_quantity: e.target.value }))}
                        className="w-full px-3 py-2 border border-border rounded-lg"
                        min={0.1}
                        step={0.5}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-foreground mb-1">Unidade</label>
                      <input
                        type="text"
                        value={formData.yield_unit}
                        onChange={(e) => setFormData(prev => ({ ...prev, yield_unit: e.target.value }))}
                        className="w-full px-3 py-2 border border-border rounded-lg"
                        placeholder="Ex: porções"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sumário de conteúdo */}
          {type === 'diet' && formData.meals.length > 0 && (
            <div className="bg-primary/10 rounded-xl border border-primary/20 p-4">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Resumo</p>
              <p className="text-sm text-primary">
                <span className="font-bold">{formData.meals.length}</span> refeição(ões)
              </p>
              <p className="text-sm text-primary">
                <span className="font-bold">
                  {formData.meals.reduce((acc, m) => acc + (m.foods?.length || 0), 0)}
                </span> alimento(s)
              </p>
            </div>
          )}
        </div>

        {/* Coluna Direita: Conteúdo */}
        <div className="md:col-span-2 space-y-6">
          {type === 'diet' && (
            <>
              <div className="flex justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
                <h3 className="font-semibold text-foreground">Refeições do Plano</h3>
                <button
                  onClick={handleAddMeal}
                  className="text-primary hover:text-primary text-sm font-medium flex items-center gap-1 bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Adicionar Refeição
                </button>
              </div>

              {formData.meals.length === 0 && (
                <div className="bg-card rounded-xl border-2 border-dashed border-border p-10 text-center">
                  <ChefHat className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium mb-1">Nenhuma refeição ainda</p>
                  <p className="text-sm text-muted-foreground">Clique em "Adicionar Refeição" para começar</p>
                </div>
              )}

              {formData.meals.map((meal, mealIdx) => (
                <MealCard
                  key={mealIdx}
                  meal={meal}
                  mealIdx={mealIdx}
                  onUpdateTime={(idx, time) => {
                    const newMeals = [...formData.meals];
                    newMeals[idx].time = time;
                    setFormData(prev => ({ ...prev, meals: newMeals }));
                  }}
                  onUpdateName={(idx, name) => {
                    const newMeals = [...formData.meals];
                    newMeals[idx].name = name;
                    setFormData(prev => ({ ...prev, meals: newMeals }));
                  }}
                  onAddFood={handleOpenAddFood}
                  onRemoveMeal={handleRemoveMeal}
                  onEditFood={handleOpenEditFood}
                  onRemoveFood={handleRemoveFood}
                  formatFoodUnit={formatFoodUnit}
                />
              ))}
            </>
          )}

          {(type === 'meal' || type === 'recipe') && (
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="bg-muted/40 p-4 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground">
                  {type === 'meal' ? 'Alimentos da Refeição' : 'Ingredientes'}
                </h3>
                <button
                  onClick={() => handleOpenAddFood()}
                  className="text-primary hover:text-primary text-sm font-medium flex items-center gap-1 bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {type === 'recipe' ? 'Adicionar Ingrediente' : 'Adicionar Alimento'}
                </button>
              </div>

              <div className="p-4">
                {foodList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed border-border rounded-lg">
                    Nenhum item adicionado ainda.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {foodList.map((food, foodIdx) => (
                      <FoodItem
                        key={foodIdx}
                        food={food}
                        foodIdx={foodIdx}
                        mealIdx={null}
                        onEdit={handleOpenEditFood}
                        onRemove={handleRemoveFood}
                        formatFoodUnit={formatFoodUnit}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {type === 'recipe' && (
                <div className="p-4 border-t border-border bg-muted/50">
                  <label className="block text-sm font-medium text-foreground mb-2">Modo de Preparo</label>
                  <textarea
                    value={formData.preparation_method}
                    onChange={(e) => setFormData(prev => ({ ...prev, preparation_method: e.target.value }))}
                    rows={6}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Descreva o passo a passo..."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isAddFoodOpen && (
        <AddFoodToMealDialog
          isOpen={isAddFoodOpen}
          onClose={() => { setIsAddFoodOpen(false); setEditingFood(null); setActiveMealIndex(null); }}
          onAdd={handleAddFoodConfirm}
          mealName={
            type === 'diet' && activeMealIndex !== null
              ? formData.meals[activeMealIndex]?.name
              : type === 'recipe' ? 'Receita' : 'Refeição'
          }
          initialData={editingFood !== null ? getEditingFoodInitialData() : null}
        />
      )}
      </main>
    </div>
  );
}

// ─── Sub-componentes Memoizados ──────────────────────────────────────────────

const MealCard = React.memo(({
  meal, mealIdx, onUpdateTime, onUpdateName, onAddFood, onRemoveMeal,
  onEditFood, onRemoveFood, formatFoodUnit
}) => {
  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="bg-muted/40 px-4 py-3 border-b border-border flex justify-between items-center gap-3">
        <div className="flex gap-2 items-center flex-1">
          <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="time"
            value={meal.time}
            onChange={(e) => onUpdateTime(mealIdx, e.target.value)}
            className="px-2 py-1 border border-border rounded text-sm bg-card w-28"
          />
          <input
            type="text"
            value={meal.name}
            onChange={(e) => onUpdateName(mealIdx, e.target.value)}
            className="px-2 py-1 border border-border rounded text-sm bg-card flex-1 font-medium"
          />
        </div>
        <div className="flex gap-1 ml-2">
          <button
            onClick={() => onAddFood(mealIdx)}
            className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
            title="Adicionar Alimento"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemoveMeal(mealIdx)}
            className="p-1.5 text-red-400 hover:bg-red-50 rounded transition-colors"
            title="Remover Refeição"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4">
        {meal.foods.length === 0 ? (
          <button
            onClick={() => onAddFood(mealIdx)}
            className="w-full text-sm text-muted-foreground text-center py-4 border-2 border-dashed border-border rounded-lg hover:border-primary/20 hover:text-primary transition-colors"
          >
            + Adicionar alimento
          </button>
        ) : (
          <ul className="space-y-1.5">
            {meal.foods.map((food, foodIdx) => (
              <FoodItem
                key={foodIdx}
                food={food}
                foodIdx={foodIdx}
                mealIdx={mealIdx}
                onEdit={onEditFood}
                onRemove={onRemoveFood}
                formatFoodUnit={formatFoodUnit}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});

const FoodItem = React.memo(({
  food, foodIdx, mealIdx, onEdit, onRemove, formatFoodUnit
}) => {
  return (
    <li className="flex justify-between items-center px-3 py-2 hover:bg-muted/40 rounded-lg group border border-transparent hover:border-border transition-all">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{food.name}</p>
        <p className="text-xs text-muted-foreground">{formatFoodUnit(food)}</p>
      </div>
      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-2">
        <button
          onClick={() => onEdit(mealIdx, foodIdx)}
          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
          title="Editar"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onRemove(mealIdx, foodIdx)}
          className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Remover"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
});
