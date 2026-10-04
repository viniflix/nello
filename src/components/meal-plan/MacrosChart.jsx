import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flame, Target, BarChart3, Beaker, PieChart as PieChartIcon, ArrowRight } from 'lucide-react';
import ReferenceValuesModal from './ReferenceValuesModal';
import { summarizeMicronutrients } from '@/lib/utils/micronutrientCoverage';
import { formatNutrient } from '@/lib/utils';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';
import { macroDistribution } from '@/lib/utils/mealPlanWorkspace';

const COMPACT_DRI = {
    fiber: { value: 25, unit: 'g', name: 'Fibras', icon: '🌾' },
    calcium: { value: 1000, unit: 'mg', name: 'Cálcio', icon: '🦴' },
    iron: { value: 8, unit: 'mg', name: 'Ferro', icon: '🩸' },
    vitamin_c: { value: 90, unit: 'mg', name: 'Vit. C', icon: '🍊' },
    vitamin_d: { value: 15, unit: 'mcg', name: 'Vit. D', icon: '☀️' },
    sodium: { value: 2300, unit: 'mg', name: 'Sódio', icon: '🧂', isLimit: true },
    potassium: { value: 3400, unit: 'mg', name: 'Potássio', icon: '🍌' },
    zinc: { value: 11, unit: 'mg', name: 'Zinco', icon: '⚡' },
};

const calculateMicros = (plan) => summarizeMicronutrients(plan, Object.keys(COMPACT_DRI));

const MacrosChart = ({ editor = false, title = 'Análise nutricional', protein, carbs, fat, calories, patientId, patientSlugOrId, planId, readOnly = false, compact = false, plan = null, activePlanId = null, onReferenceUpdate }) => {
    const navigate = useNavigate();
    const patientSegment = patientSlugOrId ?? patientId;
    const [showReferenceModal, setShowReferenceModal] = useState(false);
    const [activeTab, setActiveTab] = useState('macros');

    const summaryPlanId = readOnly ? (activePlanId || planId) : planId;

    const colors = {
        protein: '#7341ad',
        carbs: '#2563a6',
        fat: '#ea7c13',
    };

    const distribution = macroDistribution({ protein, carbs, fat });
    const totalMacroCals = distribution.total;
    const { protein: pPerc, carbs: cPerc, fat: fPerc } = distribution;

    const microTotals = useMemo(() => calculateMicros(plan), [plan]);

    const MacrosView = () => (
        <div className="space-y-4">
            <div className="flex justify-center">
                <svg role="img" aria-label={`Distribuição energética dos macronutrientes: proteínas ${roundedNutrition(pPerc)}%, carboidratos ${roundedNutrition(cPerc)}%, gorduras ${roundedNutrition(fPerc)}%. Energia prescrita: ${roundedNutrition(calories)} kcal.`} className="h-auto w-full max-w-[180px]" width="180" height="180" viewBox="0 0 180 180">
                    <circle cx="90" cy="90" r="66" fill="none" stroke="#e2e8f0" strokeWidth="16" />
                    {[{key:'protein',percent:pPerc,offset:0},{key:'carbs',percent:cPerc,offset:pPerc},{key:'fat',percent:fPerc,offset:pPerc+cPerc}].map(slice => slice.percent > 0 && <circle key={slice.key} cx="90" cy="90" r="66" pathLength="100" fill="none" stroke={colors[slice.key]} strokeWidth="16" strokeDasharray={`${slice.percent} ${100-slice.percent}`} strokeDashoffset={-slice.offset} transform="rotate(-90 90 90)" />)}
                    <text x="90" y="90" textAnchor="middle" fontSize="24" className="font-bold fill-foreground">{roundedNutrition(calories)}</text>
                    <text x="90" y="110" textAnchor="middle" fontSize="12" className="fill-muted-foreground">kcal no plano</text>
                </svg>
            </div>
            {!totalMacroCals && <p className="text-center text-sm text-muted-foreground">Sem macronutrientes quantificados.</p>}
            <dl className="space-y-2">
                {[{label:'Carboidratos',value:carbs,percent:cPerc,key:'carbs'},{label:'Proteínas',value:protein,percent:pPerc,key:'protein'},{label:'Gorduras',value:fat,percent:fPerc,key:'fat'}].map(macro => <div key={macro.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-sm">
                    <dt className="inline-flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:colors[macro.key]}} />{macro.label}</dt>
                    <dd className="font-semibold tabular-nums">{roundedNutrition(macro.value)} g <span className="ml-2 font-normal text-muted-foreground">{roundedNutrition(macro.percent)}%</span></dd>
                </div>)}
            </dl>
            <p className="text-xs text-muted-foreground">Percentuais pela energia dos macros (4/4/9 kcal por grama). Podem diferir da energia informada pelos alimentos.</p>
        </div>
    );

    const MicrosView = () => {
        const hasData = Object.values(microTotals).some(v => v.known > 0 || v.unknown > 0);

        if (!plan || !hasData) {
            return (
                <div className="flex flex-col items-center justify-center pt-10 text-center space-y-3 px-4">
                    <Beaker className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">Micronutrientes ainda não informados</p>
                    <p className="text-xs text-muted-foreground/70">As informações dependem do cadastro detalhado dos alimentos.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col justify-center h-full space-y-0.5">
                {Object.entries(COMPACT_DRI).map(([key, dri]) => {
                    const coverage = microTotals[key];
                    const value = coverage.value;
                    const complete = coverage.known > 0 && coverage.unknown === 0;
                    const pct = complete && dri.value > 0 ? (value / dri.value) * 100 : 0;
                    const cappedPct = Math.min(pct, 100);

                    const isLimit = dri.isLimit;
                    const isSafe = isLimit ? pct <= 100 : pct >= 100;
                    const barColor = !complete ? 'bg-slate-300' : isSafe ? 'bg-green-500' : (isLimit ? 'bg-red-500' : 'bg-yellow-500');

                    return (
                        <div key={key} className="space-y-1 bg-white border border-border/60 rounded-md p-1.5 px-2">
                            <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
                                <div className="flex items-center gap-1.5 text-foreground font-medium">
                                    <span>{dri.icon}</span>
                                    <span>{dri.name}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-foreground">{coverage.known ? `${coverage.unknown ? '≥ ' : ''}${formatNutrient(Math.round(value))} ${dri.unit}${coverage.unknown ? ' (parcial)' : ''}` : 'Não informado'}</span>
                                    {complete && <span className="text-xs text-muted-foreground">/ {formatNutrient(Math.round(dri.value))}{dri.unit}</span>}
                                </div>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${barColor}`}
                                    style={{ width: complete ? `${Math.max(cappedPct, 2)}%` : '100%' }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Card className="flex min-w-0 flex-col bg-white border-border shadow-sm">
            <CardHeader className="px-[12px] pb-3 pt-5 sm:px-6">
                <CardTitle className="text-base font-semibold flex items-center justify-center w-full">
                    <div className="flex min-w-0 items-center gap-2 text-foreground">
                        <Flame className="w-4 h-4 shrink-0 text-[#c4661f]" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
                    </div>
                </CardTitle>

                {/* Tabs */}
                <div className={editor ? "mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" : "flex flex-wrap gap-2 mt-4"}>
                    <button
                        type="button" aria-pressed={activeTab === 'macros'} onClick={() => setActiveTab('macros')}
                        className={`${editor ? "text-xs" : ""} min-w-0 flex-[1_1_9rem] flex flex-wrap items-center justify-center gap-1 min-h-10 px-2 py-2 text-sm font-semibold break-words rounded-md border transition-colors ${
                            activeTab === 'macros'
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-white text-muted-foreground border-border hover:bg-muted'
                        }`}
                    >
                        <PieChartIcon className="w-3.5 h-3.5" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">Macronutrientes</span>
                    </button>
                    <button
                        type="button" aria-pressed={activeTab === 'micros'} onClick={() => setActiveTab('micros')}
                        className={`${editor ? "text-xs" : ""} min-w-0 flex-[1_1_9rem] flex flex-wrap items-center justify-center gap-1 min-h-10 px-2 py-2 text-sm font-semibold break-words rounded-md border transition-colors ${
                            activeTab === 'micros'
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-white text-muted-foreground border-border hover:bg-muted'
                        }`}
                    >
                        <Beaker className="w-3.5 h-3.5" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">Micronutrientes</span>
                    </button>
                </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col px-[12px] pt-2 pb-5 sm:px-6">
                {activeTab === 'micros' && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Referências gerais para adultos; não são metas individuais. Dados incompletos não permitem avaliar adequação.</p>}
                <div className={compact ? "min-h-[285px]" : "min-h-[300px]"}>
                    {activeTab === 'macros' ? MacrosView() : MicrosView()}
                </div>

                {/* Footer Buttons */}
                {!readOnly && (
                    <div className="pt-4 mt-auto border-t space-y-2">
                        <Button type="button" variant="outline" size="sm" disabled={!planId} title={!planId ? 'Adicione uma refeição para configurar as metas do plano' : undefined} onClick={() => setShowReferenceModal(true)} className="w-full gap-2">
                            <Target className="w-4 h-4" />
                            Definir Metas
                        </Button>
                        {planId && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/nutritionist/patients/${patientSegment}/meal-plan/${planId}/summary`)}
                                className="w-full gap-2 text-primary"
                            >
                                <BarChart3 className="w-4 h-4" />
                                Relatório Detalhado
                            </Button>
                        )}
                    </div>
                )}

                {readOnly && summaryPlanId && (
                    <div className="pt-4 mt-auto border-t">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientSegment}/meal-plan/${summaryPlanId}/summary`)}
                            className="w-full gap-2 text-primary hover:text-primary/80"
                        >
                            <BarChart3 className="w-4 h-4" />
                            Análise Completa
                            <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                        </Button>
                    </div>
                )}
            </CardContent>

            {planId && (
                <ReferenceValuesModal
                    isOpen={showReferenceModal}
                    onClose={() => {
                        setShowReferenceModal(false);
                        if (onReferenceUpdate) onReferenceUpdate();
                    }}
                    planId={planId}
                />
            )}
        </Card>
    );
};

export default React.memo(MacrosChart);
