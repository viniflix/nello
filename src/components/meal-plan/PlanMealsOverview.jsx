import React, { useState } from 'react';
import { Clock, ChevronDown, UtensilsCrossed, Plus, Edit, MoreVertical, Copy, ArrowRightLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import { displayNumber, roundedNutrition, mealColors } from '@/lib/utils/mealPlanPresentation';

function FoodRow({ food, onAction }) {
    const measure = food.measure || food.measure_snapshot;
    const quantity = Number(food.quantity ?? 0);
    const weight = ['g','gram','grams','gramas'].includes(food.unit || 'gram') ? quantity : measure && Number(measure.weight_in_grams ?? measure.grams_equivalent ?? measure.quantity_grams ?? measure.grams) > 0 ? quantity * Number(measure.weight_in_grams ?? measure.grams_equivalent ?? measure.quantity_grams ?? measure.grams) : null;
    const name = food.patient_description || food.food?.name || food.foods?.name || 'Alimento';
    return <li className="py-3"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_80px_65px_32px]">
        <div className="min-w-0"><p className="break-words font-semibold">{name}</p>{food.food?.description && <p className="mt-1 text-xs text-muted-foreground">{food.food.description}</p>}</div>
        <p className="col-start-1 break-words text-primary md:col-start-auto">{formatQuantityWithUnit(food.quantity ?? 0, food.unit || 'gram', measure)}</p>
        <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 md:contents"><p className="text-xs text-muted-foreground">{weight === null ? 'Peso não informado' : `${roundedNutrition(weight)} g`}</p>
        <p className="text-xs font-semibold tabular-nums">{food.calories == null ? '—' : `${roundedNutrition(food.calories)} kcal`}</p></div>
        {onAction && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="col-start-2 row-start-1 row-span-2 h-10 w-10 md:col-start-auto md:row-start-auto md:row-span-1 md:h-8 md:w-8" aria-label={`Ações de ${name}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onAction('food', food)}><Edit className="mr-2 h-4 w-4" />Editar alimento e porção</DropdownMenuItem><DropdownMenuItem onClick={() => onAction('substitutions', food)}><ArrowRightLeft className="mr-2 h-4 w-4" />Substituições</DropdownMenuItem><DropdownMenuItem onClick={() => onAction('meal')}><Trash2 className="mr-2 h-4 w-4" />Gerenciar alimentos da refeição</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </div>{food.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{food.notes}</p>}
    {!!food.substitutes?.length && <div className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-950"><p className="font-medium">Ou substitua por uma destas opções:</p><ul className="mt-1 space-y-1">{food.substitutes.map((substitute,index) => <li key={substitute.id || index} className="break-words">{substitute.name || substitute.food?.name || substitute.foods?.name || 'Alimento'} · {formatQuantityWithUnit(substitute.quantity ?? 0, substitute.unit || 'gram', substitute.measure || substitute.measure_snapshot)}</li>)}</ul></div>}</li>;
}
export default function PlanMealsOverview({ meals = [], dailyCalories = 0, onAction }) {
    const [allOpen, setAllOpen] = useState(null);
    return <section aria-label="Refeições do plano" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-normal">Refeições do plano</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Confira as porções e ajuste cada refeição sem perder o contexto.</p></div>{onAction && <Button variant="outline" size="sm" className="gap-2 text-primary" onClick={() => onAction('addMeal')}><Plus className="h-4 w-4" />Adicionar refeição</Button>}</div>
        {meals.length > 0 && <Button variant="ghost" size="sm" className="px-0 text-xs text-muted-foreground" onClick={() => setAllOpen(value => !value)}>{allOpen ? 'Recolher refeições' : 'Expandir refeições'}</Button>}
        {!meals.length && <div className="rounded-xl border border-dashed p-6 text-center"><UtensilsCrossed aria-hidden="true" className="mx-auto mb-3 h-6 w-6 text-primary" /><p className="text-sm text-muted-foreground">Comece adicionando a primeira refeição.</p></div>}
        {meals.map((meal,index) => {
            const included = meal.include_in_totals !== false;
            const percentage = included && displayNumber(dailyCalories) > 0 ? displayNumber(meal.total_calories ?? meal.calories) / dailyCalories * 100 : null;
            return <div key={meal.id || meal.tempId || index} className="overflow-hidden rounded-xl border border-l-4 bg-white" style={{borderLeftColor:mealColors[index % mealColors.length]}}>
                <details open={allOpen ?? index === 0} className="group min-w-0 [overflow-wrap:anywhere]">
                    <summary className="relative flex flex-wrap cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"><span className="flex min-w-0 basis-full items-center gap-3 pr-6 sm:flex-[1_1_10rem] sm:pr-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/5"><UtensilsCrossed aria-hidden="true" className="h-4 w-4 text-primary" /></span><span className="min-w-0"><span className="block break-words font-semibold">{meal.name || 'Refeição'}</span>{meal.meal_time && <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{meal.meal_time.slice(0,5)}</span>}</span></span><span className="text-left sm:text-right"><span className="block text-sm font-semibold tabular-nums">{roundedNutrition(meal.total_calories ?? meal.calories)} kcal</span>{percentage !== null && <span className="text-xs text-muted-foreground">{roundedNutrition(percentage)}% do dia</span>}</span><span className="text-xs text-muted-foreground">{meal.foods?.length || 0} {(meal.foods?.length || 0) === 1 ? 'alimento' : 'alimentos'}</span><ChevronDown aria-hidden="true" className="absolute right-4 top-6 ml-auto h-4 w-4 sm:static transition-transform group-open:rotate-180 motion-reduce:transition-none" />{!included && <span className="basis-full rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">Opção alternativa · fora dos totais</span>}</summary>
                    <div className="border-t px-4 pb-4">{meal.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{meal.notes}</p>}
                        {!meal.foods?.length ? <p className="py-4 text-sm text-muted-foreground">Essa refeição ainda não possui alimentos.</p> : <><div aria-hidden="true" className="mt-3 hidden grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_80px_65px_32px] gap-2 rounded bg-slate-50 px-0 py-2 text-xs text-muted-foreground md:grid"><span>Alimento</span><span>Porção / medida caseira</span><span>Quantidade</span><span>kcal</span><span /></div><ul className="divide-y">{meal.foods.map((food,foodIndex) => <FoodRow key={food.id || food.tempId || foodIndex} food={food} onAction={onAction ? (action,target) => onAction(action,meal,target) : null} />)}</ul></>}
                        {onAction && <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" className="gap-2 text-primary" onClick={() => onAction('addFood',meal)}><Plus className="h-4 w-4" />Adicionar alimento</Button><Button variant="ghost" size="sm" className="gap-2" onClick={() => onAction('duplicate',meal)}><Copy className="h-4 w-4" />Duplicar refeição</Button></div>}
                    </div>
                </details>{onAction && <div className="flex justify-end border-t bg-slate-50/50 px-3 py-1"><Button variant="ghost" size="sm" aria-label={`Editar refeição ${meal.name}`} onClick={() => onAction('meal',meal)} className="gap-2 text-xs"><Edit className="h-3.5 w-3.5" />Editar refeição</Button></div>}
            </div>;
        })}
    </section>;
}
