import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Utensils, History, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShadowSaveStatus } from '@/components/ui/shadow-save-status';
import { patientHubRoute } from '@/lib/utils/patientRoutes';

export default function MealPlanEditorHeader({ busy = false, patientId, patientSlugOrId, patientName, plan, status, onRetry, onRecovery, onBack }) {
    const hub = patientHubRoute({ id: patientId, slug: patientSlugOrId }, 'nutrition');
    return <header className="space-y-4">
        <nav aria-label="Navegação estrutural" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Link className="rounded hover:text-primary focus-visible:ring-2 focus-visible:ring-primary" to="/nutritionist/patients">Pacientes</Link><ChevronRight aria-hidden="true" className="h-3 w-3" />
            <Link className="rounded hover:text-primary focus-visible:ring-2 focus-visible:ring-primary" to={hub}>{patientName || 'Paciente'}</Link><ChevronRight aria-hidden="true" className="h-3 w-3" /><span>Nutrição</span><ChevronRight aria-hidden="true" className="h-3 w-3" />
            <button type="button" disabled={busy} onClick={onBack} className="rounded hover:text-primary focus-visible:ring-2 focus-visible:ring-primary">Plano alimentar</button><ChevronRight aria-hidden="true" className="h-3 w-3" /><span aria-current="page" className="font-semibold text-foreground">{plan ? 'Editar plano' : 'Novo plano'}</span>
        </nav>
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div className="min-w-0"><h1 className="flex items-start gap-3 text-xl font-semibold uppercase tracking-wide sm:text-2xl"><Utensils aria-hidden="true" className="mt-1 h-7 w-7 shrink-0 text-primary" />{plan ? 'Editar plano alimentar' : 'Novo plano alimentar'}</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Monte as refeições, ajuste porções e acompanhe a análise nutricional em tempo real.</p></div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 xl:max-w-[520px] xl:justify-end">
                <Badge variant="outline" className={`min-h-9 gap-2 rounded-lg px-3 ${plan?.is_active ? 'border-primary/20 bg-primary/5 text-primary' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />{plan?.is_active ? 'Plano ativo' : plan && !plan.is_draft ? 'Plano inativo' : 'Rascunho'}</Badge>
                <div className="min-w-0 rounded-lg border bg-white px-3 py-2"><ShadowSaveStatus status={status} onRetry={onRetry} />{(!status || status === 'idle') && <span className="text-xs text-muted-foreground">A edição será salva automaticamente</span>}</div>
                <Button type="button" size="sm" variant="outline" className="gap-2" disabled={busy} onClick={onRecovery}><History aria-hidden="true" className="h-4 w-4" />Histórico de recuperação</Button>
            </div>
        </div>
        <button type="button" className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-primary" disabled={busy} onClick={onBack}><ArrowLeft aria-hidden="true" className="h-3 w-3" />Voltar aos planos</button>
    </header>;
}
