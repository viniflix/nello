import React from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClinicalFlags } from '@/hooks/useClinicalFlags';
import { cn } from '@/lib/utils';

/**
 * ClinicalAlertsPanel — Sprint 8 UI
 * Painel de alertas clínicos extraídos automaticamente das anamneses.
 * Exibido no Hub do paciente e na cabeçalho do formulário de anamnese.
 */
export function ClinicalAlertsPanel({ patientId, compact = false, className }) {
    const { flagsList, isLoading, removeFlag } = useClinicalFlags(patientId);

    if (isLoading) return null;
    if (!flagsList.length) return null;

    const allergies = flagsList.filter(f => f.key.includes('alergi') || f.key.includes('intoleranc'));
    const chronics = flagsList.filter(f =>
        f.key.includes('doenca') || f.key.includes('cronico') || f.key.includes('comorbidade')
    );
    const others = flagsList.filter(f => !allergies.includes(f) && !chronics.includes(f));

    const renderFlag = (flag) => (
        <div
            key={flag.key}
            title={`${flag.label}: ${flag.value} · Fonte: ${flag.source === 'nutritionist' ? 'Manual' : 'Anamnese'}${flag.captured_at ? ' · ' + new Date(flag.captured_at).toLocaleDateString('pt-BR') : ''}`}
            className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold group cursor-default",
                flag.key.includes('alergi') || flag.key.includes('intoleranc')
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
            )}
        >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[120px]">{flag.label}</span>
            {!compact && (
                <button
                    onClick={() => removeFlag.mutate(flag.key)}
                    className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remover alerta"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );

    if (compact) {
        return (
            <div className={cn("flex flex-wrap gap-1.5 items-center", className)}>
                {flagsList.slice(0, 5).map(renderFlag)}
                {flagsList.length > 5 && (
                    <Badge variant="outline" className="text-xs text-slate-500">
                        +{flagsList.length - 5} alertas
                    </Badge>
                )}
            </div>
        );
    }

    return (
        <Card className={cn("border-amber-100 bg-amber-50/40", className)}>
            <CardHeader className="pb-3 pt-4 px-5">
                <CardTitle className="text-sm font-bold text-amber-900 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    Alertas Clínicos Ativos
                    <Badge className="ml-auto bg-amber-100 text-amber-700 border-amber-200 font-bold">
                        {flagsList.length}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-3">
                {allergies.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-wider">Alergias / Intolerâncias</p>
                        <div className="flex flex-wrap gap-1.5">{allergies.map(renderFlag)}</div>
                    </div>
                )}
                {chronics.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Doenças / Comorbidades</p>
                        <div className="flex flex-wrap gap-1.5">{chronics.map(renderFlag)}</div>
                    </div>
                )}
                {others.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Outros Alertas</p>
                        <div className="flex flex-wrap gap-1.5">{others.map(renderFlag)}</div>
                    </div>
                )}
                <p className="text-[10px] text-slate-400 pt-1">
                    Extraído automaticamente das anamneses respondidas. Passe o mouse para ver detalhes.
                </p>
            </CardContent>
        </Card>
    );
}
