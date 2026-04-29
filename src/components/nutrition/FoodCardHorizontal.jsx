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

const SOURCE_CONFIG = {
    'TACO':      { label: 'TACO',         color: 'bg-blue-50 text-blue-700 border-blue-200' },
    'TBCA':      { label: 'TBCA',         color: 'bg-pink-50 text-pink-700 border-pink-200' },
    'USDA':      { label: 'USDA',         color: 'bg-violet-50 text-violet-700 border-violet-200' },
    'TUCUNDUVA': { label: 'Tucunduvá',    color: 'bg-orange-50 text-orange-700 border-orange-200' },
    'Nello':     { label: 'Nello',        color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    'custom':    { label: 'Personalizado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const calColor = (cal) => {
    if (!cal) return 'text-slate-400';
    if (cal < 100) return 'text-green-600';
    if (cal < 250) return 'text-amber-600';
    return 'text-red-600';
};

const MacroCell = ({ value, label, color }) => (
    <div className="text-center min-w-[42px]">
        <p className={`text-xs font-bold ${color}`}>{value ?? '—'}</p>
        <p className="text-[10px] text-slate-400 font-medium">{label}</p>
    </div>
);

const FoodCardHorizontal = ({ food, isCustom = false, onView, onEdit, onDelete }) => {
    const src = SOURCE_CONFIG[food.source] || { label: food.source, color: 'bg-slate-100 text-slate-600 border-slate-200' };
    const cal = food.calories ? Math.round(food.calories) : null;

    return (
        <div
            className="flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-xl hover:border-emerald-300 hover:shadow-sm transition-all duration-150 group cursor-pointer"
            onClick={() => onView && onView(food)}
        >
            {/* Nome + Grupo + Badge */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-800 truncate leading-tight">
                        {food.name}
                    </h3>
                    <Badge className={`${src.color} text-[10px] px-1.5 py-0 h-4 font-semibold border flex-shrink-0`}>
                        {src.label}
                    </Badge>
                </div>
                {food.group && (
                    <p className="text-[11px] text-slate-400 truncate">{food.group}</p>
                )}
            </div>

            {/* Macros — desktop */}
            <div className="hidden sm:flex items-center gap-1 flex-shrink-0 bg-slate-50 rounded-lg px-2 py-1">
                <MacroCell value={cal ? `${cal}` : null} label="kcal" color={calColor(cal)} />
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <MacroCell value={food.protein ? food.protein.toFixed(1) : null} label="P g" color="text-violet-600" />
                <MacroCell value={food.carbs   ? food.carbs.toFixed(1)   : null} label="C g" color="text-blue-600" />
                <MacroCell value={food.fat     ? food.fat.toFixed(1)     : null} label="G g" color="text-orange-500" />
            </div>

            {/* Kcal — mobile */}
            <div className="flex sm:hidden flex-shrink-0 text-xs font-bold" style={{ color: calColor(cal) === 'text-green-600' ? '#16a34a' : calColor(cal) === 'text-amber-600' ? '#d97706' : '#dc2626' }}>
                {cal ? `${cal} kcal` : '—'}
            </div>

            {/* Ações */}
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                        <DropdownMenuItem onClick={() => onView && onView(food)}>
                            <Eye className="h-4 w-4 mr-2 text-slate-400" /> Ver detalhes
                        </DropdownMenuItem>
                        {isCustom && onEdit && (
                            <DropdownMenuItem onClick={() => onEdit(food)}>
                                <Edit className="h-4 w-4 mr-2 text-slate-400" /> Editar
                            </DropdownMenuItem>
                        )}
                        {isCustom && onDelete && (
                            <DropdownMenuItem onClick={() => onDelete(food)} className="text-red-600 focus:text-red-600">
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};

export default FoodCardHorizontal;
