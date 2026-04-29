import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTemplateBuilder } from '@/hooks/useTemplateBuilder';
import { ArrowLeft, Save, Plus, FileText, Coffee, UtensilsCrossed, Trash2 } from 'lucide-react';
import AddFoodToMealDialog from '@/components/meal-plan/AddFoodToMealDialog';

export default function TemplateBuilder() {
  const { type } = useParams();
  const navigate = useNavigate();
  const { formData, setFormData, handleSave, loading } = useTemplateBuilder(type);
  
  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false);
  const [activeMealIndex, setActiveMealIndex] = useState(null);

  const getTitle = () => {
    switch(type) {
      case 'diet': return 'Nova Dieta Padrão';
      case 'meal': return 'Nova Refeição Isolada';
      case 'recipe': return 'Nova Receita';
      default: return 'Novo Template';
    }
  };

  const getIcon = () => {
    switch(type) {
      case 'diet': return <FileText className="w-5 h-5 text-emerald-600" />;
      case 'meal': return <Coffee className="w-5 h-5 text-emerald-600" />;
      case 'recipe': return <UtensilsCrossed className="w-5 h-5 text-emerald-600" />;
      default: return null;
    }
  };

  const handleAddMeal = () => {
    setFormData(prev => ({
      ...prev,
      meals: [...prev.meals, { name: `Refeição ${prev.meals.length + 1}`, time: '12:00', foods: [] }]
    }));
  };

  const handleRemoveMeal = (idx) => {
    setFormData(prev => ({
      ...prev,
      meals: prev.meals.filter((_, i) => i !== idx)
    }));
  };

  const handleOpenAddFood = (mealIndex = null) => {
    setActiveMealIndex(mealIndex);
    setIsAddFoodOpen(true);
  };

  const handleAddFoodConfirm = (foodData) => {
    const newFood = {
      food_id: foodData.food.id,
      name: foodData.food.name,
      quantity: foodData.quantity,
      unit: foodData.unit,
      measure: foodData.measure, // keep measure for display
      observation: foodData.notes || ''
    };

    if (type === 'diet') {
      setFormData(prev => {
        const newMeals = [...prev.meals];
        newMeals[activeMealIndex].foods.push(newFood);
        return { ...prev, meals: newMeals };
      });
    } else if (type === 'meal') {
      setFormData(prev => ({ ...prev, foods: [...prev.foods, newFood] }));
    } else if (type === 'recipe') {
      setFormData(prev => ({ ...prev, ingredients: [...prev.ingredients, newFood] }));
    }
    
    setIsAddFoodOpen(false);
    setActiveMealIndex(null);
  };

  const handleRemoveFood = (mealIndex, foodIndex) => {
    if (type === 'diet') {
      setFormData(prev => {
        const newMeals = [...prev.meals];
        newMeals[mealIndex].foods = newMeals[mealIndex].foods.filter((_, i) => i !== foodIndex);
        return { ...prev, meals: newMeals };
      });
    } else if (type === 'meal') {
      setFormData(prev => ({
        ...prev,
        foods: prev.foods.filter((_, i) => i !== foodIndex)
      }));
    } else if (type === 'recipe') {
      setFormData(prev => ({
        ...prev,
        ingredients: prev.ingredients.filter((_, i) => i !== foodIndex)
      }));
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Helmet>
        <title>{getTitle()} - HipoZero</title>
      </Helmet>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/nutritionist/templates')}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              {getIcon()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{getTitle()}</h1>
              <p className="text-slate-500 text-sm">Configure os dados do seu novo template.</p>
            </div>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-colors font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{loading ? 'Salvando...' : 'Salvar Template'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna Esquerda: Meta Dados */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Informações Básicas</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Template *</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Ex: Dieta Hipertrofia Masculina"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                  placeholder="Descreva o propósito deste template..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tags (separadas por vírgula)</label>
                <input 
                  type="text" 
                  value={formData.tags.join(', ')}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) 
                  }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="ex: hipertrofia, sem-lactose"
                />
              </div>

              {type === 'recipe' && (
                <>
                  <div className="pt-4 border-t border-slate-100">
                    <h3 className="font-semibold text-slate-800 mb-3">Rendimento</h3>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Quantidade</label>
                        <input 
                          type="number" 
                          value={formData.yield_quantity}
                          onChange={(e) => setFormData(prev => ({ ...prev, yield_quantity: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Unidade</label>
                        <input 
                          type="text" 
                          value={formData.yield_unit}
                          onChange={(e) => setFormData(prev => ({ ...prev, yield_unit: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                          placeholder="Ex: porções"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Conteúdo (Refeições/Alimentos) */}
        <div className="md:col-span-2 space-y-6">
          {type === 'diet' && (
            <>
              <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-semibold text-slate-800">Refeições do Plano</h3>
                <button 
                  onClick={handleAddMeal}
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Adicionar Refeição
                </button>
              </div>

              {formData.meals.map((meal, mealIdx) => (
                <div key={mealIdx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex gap-3 items-center flex-1">
                      <input 
                        type="time" 
                        value={meal.time}
                        onChange={(e) => {
                          const newMeals = [...formData.meals];
                          newMeals[mealIdx].time = e.target.value;
                          setFormData(prev => ({ ...prev, meals: newMeals }));
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-sm bg-white"
                      />
                      <input 
                        type="text" 
                        value={meal.name}
                        onChange={(e) => {
                          const newMeals = [...formData.meals];
                          newMeals[mealIdx].name = e.target.value;
                          setFormData(prev => ({ ...prev, meals: newMeals }));
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-sm bg-white flex-1 font-medium"
                      />
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button 
                        onClick={() => handleOpenAddFood(mealIdx)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        title="Adicionar Alimento"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleRemoveMeal(mealIdx)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Remover Refeição"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    {meal.foods.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-2">Nenhum alimento adicionado nesta refeição.</p>
                    ) : (
                      <ul className="space-y-2">
                        {meal.foods.map((food, foodIdx) => (
                          <li key={foodIdx} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg group border border-transparent hover:border-slate-100">
                            <div>
                              <p className="text-sm font-medium text-slate-700">{food.name}</p>
                              <p className="text-xs text-slate-500">
                                {food.quantity} {food.unit === 'gram' ? 'g' : (food.measure ? food.measure.label : food.unit)}
                                {food.observation && ` • Obs: ${food.observation}`}
                              </p>
                            </div>
                            <button 
                              onClick={() => handleRemoveFood(mealIdx, foodIdx)}
                              className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {(type === 'meal' || type === 'recipe') && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800">
                  {type === 'meal' ? 'Alimentos da Refeição' : 'Ingredientes'}
                </h3>
                <button 
                  onClick={() => handleOpenAddFood()}
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> {type === 'recipe' ? 'Adicionar Ingrediente' : 'Adicionar Alimento'}
                </button>
              </div>
              
              <div className="p-4">
                {(!formData.foods && !formData.ingredients) || (formData.foods?.length === 0 && formData.ingredients?.length === 0) ? (
                  <p className="text-sm text-slate-400 text-center py-6 border-2 border-dashed border-slate-100 rounded-lg">
                    Nenhum item adicionado ainda.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(type === 'meal' ? formData.foods : formData.ingredients).map((food, foodIdx) => (
                      <li key={foodIdx} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg border border-slate-100 group">
                        <div>
                          <p className="text-sm font-medium text-slate-700">{food.name}</p>
                          <p className="text-xs text-slate-500">
                            {food.quantity} {food.unit === 'gram' ? 'g' : (food.measure ? food.measure.label : food.unit)}
                            {food.observation && ` • Obs: ${food.observation}`}
                          </p>
                        </div>
                        <button 
                          onClick={() => handleRemoveFood(null, foodIdx)}
                          className="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {type === 'recipe' && (
                <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Modo de Preparo</label>
                  <textarea 
                    value={formData.preparation_method}
                    onChange={(e) => setFormData(prev => ({ ...prev, preparation_method: e.target.value }))}
                    rows={6}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
          onClose={() => setIsAddFoodOpen(false)}
          onAdd={handleAddFoodConfirm}
          mealName={type === 'diet' && activeMealIndex !== null ? formData.meals[activeMealIndex].name : (type === 'recipe' ? 'Receita' : 'Refeição')}
        />
      )}
    </div>
  );
}
