import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useClinicalFlags } from '@/hooks/useClinicalFlags';
import { cn } from '@/lib/utils';

/**
 * Sprint D: Barra de alertas clínicos para o topo do Plano Alimentar.
 *
 * Exibe alergias e comorbidades extraídas das anamneses,
 * com suporte a expansão/colapso para não poluir a tela.
 */
export function MealPlanAlertsBar({ patientId }) {
    const { flagsList, hasAllergies, hasChronic, isLoading } = useClinicalFlags(patientId);
    const [expanded, setExpanded] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    if (isLoading || dismissed || flagsList.length === 0) return null;

    const allergyFlags = flagsList.filter(f =>
        f.key.includes('alergi') || f.key.includes('intoleranc')
    );
    const chronicFlags = flagsList.filter(f =>
        f.key.includes('doenca') || f.key.includes('cronico') || f.key.includes('comorbidade') || f.key.includes('disfuncao')
    );
    const otherFlags = flagsList.filter(f =>
        !allergyFlags.includes(f) && !chronicFlags.includes(f)
    );

    const criticalCount = allergyFlags.length + chronicFlags.length;

    return (
        <div className={cn(
            'rounded-xl border shadow-sm overflow-hidden transition-all duration-300 mb-4',
            hasAllergies ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
        )}>
            {/* Header da barra */}
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                onClick={() => setExpanded(e => !e)}
            >
                <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    hasAllergies ? 'bg-red-100' : 'bg-amber-100'
                )}>
                    <ShieldAlert className={cn('w-4 h-4', hasAllergies ? 'text-red-600' : 'text-amber-600')} />
                </div>

                <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-bold', hasAllergies ? 'text-red-800' : 'text-amber-800')}>
                        {criticalCount > 0
                            ? `${criticalCount} alerta(s) clínico(s) ativo(s) para este paciente`
                            : `${flagsList.length} observação(ões) clínica(s)`
                        }
                    </p>
                    {!expanded && (
                        <p className={cn('text-xs truncate', hasAllergies ? 'text-red-600' : 'text-amber-600')}>
                            {flagsList.slice(0, 3).map(f => f.label).join(' · ')}
                            {flagsList.length > 3 && ` · +${flagsList.length - 3} mais`}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {expanded
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />
                    }
                    <button
                        onClick={e => { e.stopPropagation(); setDismissed(true); }}
                        className="p-1 rounded-md hover:bg-black/10 transition-colors"
                        title="Dispensar alertas (apenas nesta sessão)"
                    >
                        <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Conteúdo expandido */}
            {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
                    {allergyFlags.length > 0 && (
                        <FlagGroup
                            title="Alergias / Intolerâncias"
                            flags={allergyFlags}
                            color="red"
                        />
                    )}
                    {chronicFlags.length > 0 && (
                        <FlagGroup
                            title="Doenças / Comorbidades"
                            flags={chronicFlags}
                            color="amber"
                        />
                    )}
                    {otherFlags.length > 0 && (
                        <FlagGroup
                            title="Outras Observações"
                            flags={otherFlags}
                            color="slate"
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function FlagGroup({ title, flags, color }) {
    const colorMap = {
        red: 'text-red-700 bg-red-100 border-red-200',
        amber: 'text-amber-700 bg-amber-100 border-amber-200',
        slate: 'text-slate-700 bg-slate-100 border-slate-200',
    };

    return (
        <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{title}</p>
            <div className="flex flex-wrap gap-2">
                {flags.map(flag => (
                    <span
                        key={flag.key}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
                            colorMap[color]
                        )}
                        title={`Fonte: ${flag.source === 'patient' ? 'Respondido pelo paciente' : flag.source === 'nutritionist' ? 'Adicionado pelo nutricionista' : 'Anamnese'}`}
                    >
                        <AlertTriangle className="w-3 h-3" />
                        {flag.label}
                    </span>
                ))}
            </div>
        </div>
    );
}
