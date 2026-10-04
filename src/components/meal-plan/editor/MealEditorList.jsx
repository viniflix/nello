import React, { useState } from 'react';
import { Plus, Download, Edit, Copy, Trash2, ChevronDown, GripVertical, ArrowUp, ArrowDown, Sun, Coffee, Moon, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { FoodRow } from '../PlanMealsOverview';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';
const mealIcon = type => type === 'breakfast' ? Sun : ['dinner', 'supper'].includes(type) ? Moon : type?.includes('snack') ? Coffee : Utensils;
function MealEditorCard({ meal, index, count, total, dragging, disabled, onEdit, onCopy, onMove, onDelete, onInclude, onRemoveFood, onDragStart, onDragEnd, onDragCancel }) {
    const [open, setOpen] = useState(index === 0);
    const Icon = mealIcon(meal.meal_type);
    const included = meal.include_in_totals !== false;
    return <article data-meal-sort-index={index} aria-label={`Refeição ${meal.name}`} className={`min-w-0 overflow-hidden rounded-xl border border-l-[3px] border-l-violet-500 bg-white ${dragging ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <div className="flex min-w-0 basis-full items-center gap-2 sm:flex-1">
            <button type="button" disabled={disabled} aria-label={`Arrastar ${meal.name}`} onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragCancel} className="touch-none cursor-grab rounded p-1.5 text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"><GripVertical aria-hidden="true" className="h-4 w-4" /></button>
            <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-orange-600" />
            <button type="button" aria-expanded={open} aria-controls={`meal-foods-${meal.tempId || meal.id}`} onClick={() => setOpen(!open)} className="min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:ring-primary"><span className="block break-words text-sm font-semibold">{meal.name}</span>{meal.meal_time && <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-muted-foreground">{meal.meal_time.slice(0, 5)}</span>}</button>
            </div><div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap">
            <div className="min-w-0 text-left sm:text-right"><p className="text-sm font-semibold tabular-nums">{roundedNutrition(meal.calories ?? meal.total_calories)} kcal</p><p className="text-xs text-muted-foreground">{meal.foods?.length || 0} {(meal.foods?.length || 0) === 1 ? 'alimento' : 'alimentos'}{included && total > 0 ? ` · ${roundedNutrition((meal.calories ?? meal.total_calories ?? 0) / total * 100)}% do plano` : ''}</p></div>
            <div className="flex shrink-0 items-center justify-end gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={disabled} aria-label={`Editar refeição ${meal.name}`} onClick={() => onEdit(meal)}><Edit className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={disabled} aria-label={`Duplicar ${meal.name}`} onClick={() => onCopy(index)}><Copy className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" disabled={disabled} aria-label={`Remover refeição ${meal.name}`} onClick={() => onDelete(meal)}><Trash2 className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={`${open ? 'Recolher' : 'Expandir'} ${meal.name}`} aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></Button>
            </div>
            </div>
            {!included && <p className="basis-full rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">Opção alternativa · fora dos totais nutricionais</p>}
        </div>
        {open && <div id={`meal-foods-${meal.tempId || meal.id}`} className="border-t px-3 pb-3 sm:px-4 sm:pb-4">
            {meal.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-blue-50 p-3 text-xs text-blue-900">{meal.notes}</p>}
            {!meal.foods?.length ? <p className="py-5 text-sm text-muted-foreground">Essa refeição ainda não possui alimentos.</p> : <><div aria-hidden="true" className="mt-3 hidden grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_80px_65px_32px] gap-2 rounded-lg bg-slate-50 py-2 text-xs text-muted-foreground lg:grid"><span>Alimento</span><span>Porção / medida caseira</span><span>Quantidade</span><span>kcal</span><span /></div><ul className="divide-y">{meal.foods.map((food, foodIndex) => <FoodRow key={food.tempId || food.id || foodIndex} food={food} disabled={disabled} compactSubstitutions onRemove={() => onRemoveFood(meal, food)} onAction={(action, target) => onEdit(meal, action === 'meal' ? null : { food: target, substitutions: action === 'substitutions' })} />)}</ul></>}
            <Button type="button" variant="outline" disabled={disabled} className="mt-3 w-full gap-2 border-dashed border-primary/30 text-primary" aria-label={`Adicionar alimento em ${meal.name}`} onClick={() => onEdit(meal, { newFood: true })}><Plus className="h-4 w-4" />Adicionar alimento</Button>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Checkbox disabled={disabled} checked={included} onCheckedChange={checked => onInclude(index, checked === true)} />Contabilizar esta refeição na análise nutricional</label><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || index === 0} aria-label={`Mover ${meal.name} para cima`} onClick={() => onMove(index, index - 1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || index === count - 1} aria-label={`Mover ${meal.name} para baixo`} onClick={() => onMove(index, index + 1)}><ArrowDown className="h-4 w-4" /></Button></div></div>
        </div>}
    </article>;
}
export default function MealEditorList({ meals, total, disabled, draggingIndex, onAdd, onImport, onDelete, onRemoveFood, children, ...actions }) {
    const [removing, setRemoving] = useState(null);
    const [deleting, setDeleting] = useState(false);
    return <section aria-label="Refeições do plano" className="min-w-0 space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold tracking-normal"><Utensils aria-hidden="true" className="h-5 w-5 text-primary" />Refeições</h2><div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button type="button" size="sm" variant="outline" className="bg-white gap-2" disabled={disabled} onClick={onImport}><Download className="h-4 w-4" />Importar refeições</Button><Button type="button" size="sm" className="gap-2" disabled={disabled} onClick={onAdd}><Plus className="h-4 w-4" />Nova refeição</Button></div></div>
        {children}
        {!meals.length && <div className="rounded-xl border border-dashed py-10 text-center"><Utensils aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-primary/50" /><p className="text-sm font-medium">Comece adicionando a primeira refeição.</p><p className="mt-2 text-xs text-muted-foreground">Crie uma refeição ou importe uma estrutura dos seus protocolos.</p></div>}
        {meals.map((meal, index) => <MealEditorCard key={meal.tempId || meal.id} meal={meal} index={index} count={meals.length} total={total} disabled={disabled} dragging={draggingIndex === index} {...actions} onDelete={target => setRemoving({ meal: target })} onRemoveFood={(target, food) => setRemoving({ meal: target, food })} onDragStart={event => actions.onDragStart(event, index)} />)}
        <AlertDialog open={Boolean(removing)} onOpenChange={open => { if (!open && !deleting) setRemoving(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{removing?.food ? 'Remover alimento?' : 'Remover refeição?'}</AlertDialogTitle><AlertDialogDescription>{removing?.food ? 'O alimento e suas substituições serão retirados desta edição.' : 'A refeição e seus alimentos serão retirados desta edição.'} O plano aplicado só muda ao confirmar as alterações.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel><AlertDialogAction disabled={deleting} className="bg-destructive text-destructive-foreground" onClick={async event => { event.preventDefault(); setDeleting(true); try { const result = removing.food ? await onRemoveFood(removing.meal, removing.food) : await onDelete(removing.meal); if (result !== false) setRemoving(null); } finally { setDeleting(false); } }}>{deleting ? 'Removendo…' : 'Remover'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>;
}
