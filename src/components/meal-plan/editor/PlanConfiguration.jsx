import React, { useState } from 'react';
import { FileText, Edit, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMealPlanDate } from '@/lib/utils/mealPlanPresentation';
const modes = { hybrid: 'Híbrido — porções com flexibilidade', quantitative: 'Quantitativo — porções e metas', qualitative: 'Qualitativo — orientações e escolhas' };
const days = { monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui', friday: 'Sex', saturday: 'Sáb', sunday: 'Dom' };
export default function PlanConfiguration({ formData, initiallyOpen, errors, children }) {
    const [expanded, setExpanded] = useState(initiallyOpen);
    const hasError = Boolean(errors.name || errors.start_date || errors.end_date || errors.active_days);
    const open = expanded || hasError;
    return <section aria-label="Configuração do plano" className="rounded-2xl border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><h2 className="flex items-center gap-2 text-lg font-semibold tracking-normal"><span className="rounded-xl bg-primary/5 p-2"><FileText aria-hidden="true" className="h-5 w-5 text-primary" /></span>Configuração do plano</h2><Button type="button" variant="outline" size="sm" className="gap-2 bg-white" aria-expanded={open} aria-controls="plan-configuration-fields" onClick={() => setExpanded(!open)}>{open ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}{open ? 'Concluir configurações' : 'Editar configurações'}</Button></div>
        {open ? <div id="plan-configuration-fields" className="mt-4 space-y-4">{children}</div> : <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-[1.4fr_1.4fr_1fr_1.2fr]">
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Nome do plano</dt><dd className="mt-2 break-words font-semibold">{formData.name || 'Nome ainda não definido'}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Estratégia</dt><dd className="mt-2 break-words">{modes[formData.plan_mode] || 'Não definida'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Início{formData.end_date ? ' e término' : ''}</dt><dd className="mt-2">{formatMealPlanDate(formData.start_date) || 'Não definido'}{formData.end_date && <> até {formatMealPlanDate(formData.end_date)}</>}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Dias ativos</dt><dd className="mt-2 flex flex-wrap gap-1">{formData.active_days.length ? formData.active_days.map(day => <span key={day} className="rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-xs font-medium text-primary">{days[day] || day}</span>) : 'Nenhum dia selecionado'}</dd></div>
        </dl>}
    </section>;
}
