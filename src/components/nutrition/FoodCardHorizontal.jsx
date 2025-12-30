import React from 'react';
import { Eye, Edit, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * FoodCardHorizontal - Card horizontal compacto para listagem
 * 
 * @param {Object} food - Dados do alimento
 * @param {boolean} isCustom - Se é alimento personalizado do nutricionista
 * @param {Function} onView - Callback para ver detalhes
 * @param {Function} onEdit - Callback para editar (apenas custom)
 * @param {Function} onDelete - Callback para deletar (apenas custom)
 */
const FoodCardHorizontal = ({ food, isCustom = false, onView, onEdit, onDelete }) => {
    const sourceLabels = {
        'TACO': 'TACO',
        'IBGE': 'IBGE',
        'USDA': 'USDA',
        'Tucunduva': 'Tucunduva',
        'TBCA': 'TBCA',
        'custom': 'Personalizado'
    };

    const sourceColors = {
        'TACO': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        'IBGE': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-800',
        'USDA': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        'Tucunduva': 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-orange-200 dark:border-orange-800',
        'TBCA': 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300 border-pink-200 dark:border-pink-800',
        'custom': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    };

    return (
        <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group">
            {/* Nome e Grupo */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm text-foreground truncate">
                        {food.name}
                    </h3>
                    {food.source && (
                        <Badge 
                            variant="outline" 
                            className={`${sourceColors[food.source] || 'bg-gray-100 text-gray-700'} text-[10px] px-1.5 py-0.5 h-auto font-medium flex-shrink-0`}
                        >
                            {sourceLabels[food.source] || food.source}
                        </Badge>
                    )}
                </div>
                {food.group && (
                    <p className="text-xs text-muted-foreground truncate">
                        {food.group}
                    </p>
                )}
            </div>

            {/* Macros Compactos */}
            <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                <div className="text-center min-w-[50px]">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                        {food.calories ? Math.round(food.calories) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">kcal</p>
                </div>
                <div className="text-center min-w-[45px]">
                    <p className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                        {food.protein ? food.protein.toFixed(1) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">P</p>
                </div>
                <div className="text-center min-w-[45px]">
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {food.carbs ? food.carbs.toFixed(1) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">C</p>
                </div>
                <div className="text-center min-w-[45px]">
                    <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                        {food.fat ? food.fat.toFixed(1) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">G</p>
                </div>
            </div>

            {/* Macros Mobile - Compacto */}
            <div className="flex sm:hidden items-center gap-2 flex-shrink-0">
                <div className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {food.calories ? Math.round(food.calories) : '—'}kcal
                </div>
                <div className="text-xs text-muted-foreground">
                    P:{food.protein ? food.protein.toFixed(1) : '—'} C:{food.carbs ? food.carbs.toFixed(1) : '—'} G:{food.fat ? food.fat.toFixed(1) : '—'}
                </div>
            </div>

            {/* Actions Menu */}
            <div className="flex-shrink-0">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onView && onView(food)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                        </DropdownMenuItem>
                        {isCustom && (
                            <>
                                <DropdownMenuItem onClick={() => onEdit && onEdit(food)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    onClick={() => onDelete && onDelete(food)}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};

export default FoodCardHorizontal;

