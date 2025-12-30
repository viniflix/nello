import React from 'react';
import { Eye, Edit, Trash2, Package, Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

/**
 * FoodCard - Card visual melhorado para exibir alimentos
 * 
 * @param {Object} food - Dados do alimento
 * @param {boolean} isCustom - Se é alimento personalizado do nutricionista
 * @param {Function} onView - Callback para ver detalhes
 * @param {Function} onEdit - Callback para editar (apenas custom)
 * @param {Function} onDelete - Callback para deletar (apenas custom)
 */
const FoodCard = ({ food, isCustom = false, onView, onEdit, onDelete }) => {
    const sourceLabels = {
        'TACO': 'TACO',
        'IBGE': 'IBGE',
        'USDA': 'USDA',
        'Tucunduva': 'Tucunduva',
        'TBCA': 'TBCA',
        'custom': 'Personalizado'
    };

    const sourceColors = {
        'TACO': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        'IBGE': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        'USDA': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
        'Tucunduva': 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
        'TBCA': 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
        'custom': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <Card className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-primary">
                <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                        {/* Left: Food Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-3 mb-2">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-base text-foreground mb-1 line-clamp-2">
                                        {food.name}
                                    </h3>
                                    {food.group && (
                                        <p className="text-xs text-muted-foreground mb-2">
                                            {food.group}
                                        </p>
                                    )}
                                </div>
                                {food.source && (
                                    <Badge 
                                        variant="outline" 
                                        className={`${sourceColors[food.source] || 'bg-gray-100 text-gray-700'} text-xs flex-shrink-0`}
                                    >
                                        {sourceLabels[food.source] || food.source}
                                    </Badge>
                                )}
                            </div>

                            {/* Macros */}
                            <div className="grid grid-cols-4 gap-2 mb-3">
                                <div className="text-center p-2 bg-red-50 dark:bg-red-950/20 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-0.5">Calorias</p>
                                    <p className="text-sm font-bold text-red-600 dark:text-red-400">
                                        {food.calories ? Math.round(food.calories) : '—'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">kcal</p>
                                </div>
                                <div className="text-center p-2 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-0.5">Proteína</p>
                                    <p className="text-sm font-bold text-purple-600 dark:text-purple-400">
                                        {food.protein ? food.protein.toFixed(1) : '—'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">g</p>
                                </div>
                                <div className="text-center p-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-0.5">Carbs</p>
                                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                        {food.carbs ? food.carbs.toFixed(1) : '—'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">g</p>
                                </div>
                                <div className="text-center p-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-0.5">Gorduras</p>
                                    <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                                        {food.fat ? food.fat.toFixed(1) : '—'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">g</p>
                                </div>
                            </div>

                            {/* Additional info */}
                            {(food.fiber || food.sodium) && (
                                <div className="flex gap-3 text-xs text-muted-foreground">
                                    {food.fiber && (
                                        <span>Fibra: {food.fiber.toFixed(1)}g</span>
                                    )}
                                    {food.sodium && (
                                        <span>Sódio: {food.sodium.toFixed(0)}mg</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex flex-col gap-2 flex-shrink-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onView && onView(food)}
                                className="w-full"
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                Ver Detalhes
                            </Button>
                            {isCustom && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onEdit && onEdit(food)}
                                        className="w-full"
                                    >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Editar
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onDelete && onDelete(food)}
                                        className="w-full text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Excluir
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default FoodCard;

