import React from 'react';
import { Edit, MoreVertical, ShoppingCart, Send, Save, Archive, FolderOpen, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import MacrosChart from './MacrosChart';
import PlanMealsOverview from './PlanMealsOverview';
import PlanNutritionTotals from './PlanNutritionTotals';
import NutritionInsights from './NutritionInsights';
import MealPlanDocumentActions from '@/features/documents/components/MealPlanDocumentActions';

export default function MealPlanViewer({ patientId, patientSlugOrId, activePlan, referenceValues, handleEdit, handleGenerateShoppingList, handleCopy, setSaveTemplateDialogOpen, handleArchive, formatDate, getDaysLabel, onMealAction, onImport }) {

    if (!activePlan) return null;
    return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
        <section aria-label="Plano ativo" className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div className="min-w-0 basis-full sm:flex-1 sm:basis-auto"><div className="mb-2 flex flex-wrap gap-2"><Badge className="bg-primary/10 text-primary hover:bg-primary/10">Plano ativo</Badge><Badge variant="outline">{({ quantitative: 'Quantitativo', qualitative: 'Qualitativo', hybrid: 'Híbrido' })[activePlan.plan_mode] || 'Híbrido'}</Badge></div><h2 className="break-words font-sans text-xl font-semibold tracking-normal">{activePlan.name}</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{formatDate(activePlan.start_date)}{activePlan.end_date ? ` até ${formatDate(activePlan.end_date)}` : ' · Sem data de término'} · {getDaysLabel(activePlan.active_days)}</p></div>
                <div className="flex min-w-0 flex-wrap items-center gap-1"><Button variant="outline" size="sm" onClick={() => handleEdit(activePlan.id)} className="gap-2"><Edit aria-hidden="true" className="h-4 w-4" />Editar Plano</Button><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Mais ações do plano" variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={handleGenerateShoppingList}><ShoppingCart className="mr-2 h-4 w-4" />Lista de compras</DropdownMenuItem><DropdownMenuItem onClick={() => handleCopy(activePlan.id)}><Send className="mr-2 h-4 w-4" />Copiar para outro paciente</DropdownMenuItem><DropdownMenuItem onClick={() => setSaveTemplateDialogOpen(true)}><Save className="mr-2 h-4 w-4" />Salvar como modelo</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => handleArchive(activePlan.id)} className="text-destructive"><Archive className="mr-2 h-4 w-4" />Arquivar plano</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
            </div>
            <div className="my-5"><PlanNutritionTotals plan={activePlan} /></div>
            <PlanMealsOverview meals={activePlan.meals || []} dailyCalories={activePlan.daily_calories} onAction={onMealAction} />
            <div className="mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2"><Button variant="outline" className="h-auto justify-start gap-3 whitespace-normal p-3 text-left" onClick={onImport}><FolderOpen aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0">Protocolos e modelos<span className="mt-1 block text-xs font-normal text-muted-foreground">Importar uma estrutura para um novo plano</span></span></Button><Button variant="outline" className="h-auto justify-start gap-3 whitespace-normal p-3 text-left" onClick={() => handleEdit(activePlan.id)}><FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0">Observações e configurações<span className="mt-1 block text-xs font-normal text-muted-foreground">Revisar orientações, datas e estratégia</span></span></Button></div>
            {activePlan.description && <div className="mt-4 rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-semibold tracking-normal">Orientações do plano</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{activePlan.description}</p></div>}
            <div className="mt-4"><MealPlanDocumentActions plan={activePlan} patientId={patientId} /></div>
        </section>
        <aside aria-label="Análise do plano alimentar" className="min-w-0 space-y-4 xl:sticky xl:top-4"><MacrosChart protein={activePlan.daily_protein} carbs={activePlan.daily_carbs} fat={activePlan.daily_fat} calories={activePlan.daily_calories} patientId={patientId} patientSlugOrId={patientSlugOrId} readOnly plan={activePlan} activePlanId={activePlan.id} /><NutritionInsights plan={activePlan} referenceValues={referenceValues} /></aside>
    </div>;
}
