import React, { useState, useEffect } from 'react';
import { Search, FileText, Tag, Loader2, CheckCircle2, AlertTriangle, Info, Utensils, Flame, Beef, Wheat, Droplets, Calendar, ChevronRight } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { useTemplates } from '@/hooks/useTemplates';
import { cloneDietTemplateToPatient } from '@/lib/supabase/template-queries';
import { getMealPlanById } from '@/lib/supabase/meal-plan-queries';
import { getLatestEnergyCalculation } from '@/lib/supabase/energy-queries';

const DAY_LABELS = {
    monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua',
    thursday: 'Qui', friday: 'Sex', saturday: 'Sáb', sunday: 'Dom'
};
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function MacroBar({ label, value, total, color }) {
    const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold text-slate-700">{value.toFixed(1)}g</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function AdequacyBadge({ planKcal, targetKcal }) {
    if (!targetKcal || !planKcal) return null;
    const pct = Math.round((planKcal / targetKcal) * 100);
    const delta = planKcal - targetKcal;

    let icon, text, cls;
    if (pct >= 95 && pct <= 105) {
        icon = <CheckCircle2 className="w-3.5 h-3.5" />;
        text = `Adequado (${pct}%)`;
        cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (pct >= 85 && pct < 95) {
        icon = <Info className="w-3.5 h-3.5" />;
        text = `Levemente abaixo (${pct}%)`;
        cls = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (pct > 105 && pct <= 115) {
        icon = <Info className="w-3.5 h-3.5" />;
        text = `Levemente acima (${pct}%)`;
        cls = 'bg-amber-50 text-amber-700 border-amber-200';
    } else {
        icon = <AlertTriangle className="w-3.5 h-3.5" />;
        text = `${pct < 85 ? 'Abaixo' : 'Acima'} da meta (${pct}%)`;
        cls = 'bg-red-50 text-red-700 border-red-200';
    }

    const sign = delta > 0 ? '+' : '';
    return (
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${cls}`}>
            {icon}
            <span>{text}</span>
            <span className="opacity-60">({sign}{Math.round(delta)} kcal)</span>
        </div>
    );
}

export default function TemplateManagerDialog({
    open,
    onOpenChange,
    patientId,
    nutritionistId,
    onTemplateApplied
}) {
    const { toast } = useToast();
    const { templates, loading: loadingTemplates, fetchTemplates } = useTemplates('diet');

    const [searchTerm, setSearchTerm]       = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateDetail, setTemplateDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [energyTarget, setEnergyTarget]   = useState(null);
    const [applying, setApplying]           = useState(false);

    // Reset ao abrir
    useEffect(() => {
        if (open) {
            fetchTemplates();
            setSelectedTemplate(null);
            setTemplateDetail(null);
            setSearchTerm('');
        }
    }, [open, fetchTemplates]);

    // Buscar gasto energético do paciente uma vez
    useEffect(() => {
        if (!open || !patientId) return;
        getLatestEnergyCalculation(patientId).then(({ data }) => {
            setEnergyTarget(data?.final_planned_kcal || null);
        });
    }, [open, patientId]);

    // Carregar detalhes do template selecionado
    useEffect(() => {
        if (!selectedTemplate) { setTemplateDetail(null); return; }
        const load = async () => {
            setLoadingDetail(true);
            try {
                const { data } = await getMealPlanById(selectedTemplate.id);
                setTemplateDetail(data);
            } finally {
                setLoadingDetail(false);
            }
        };
        load();
    }, [selectedTemplate]);

    const handleApplyTemplate = async () => {
        if (!selectedTemplate || !patientId || !nutritionistId) return;
        setApplying(true);
        try {
            const hasGhostFoods = (templateDetail?.meals || []).some(m => 
                (m.foods || []).some(f => !f.food || f.food.is_active === false)
            );

            if (hasGhostFoods) {
                toast({ 
                    title: 'Atenção: Alimento(s) indisponível(is)', 
                    description: 'Uma ou mais refeições contêm alimentos que não existem mais ou foram desativados. Eles serão importados, mas você deverá substituí-los no plano do paciente.', 
                    variant: 'destructive',
                    duration: 8000
                });
            }

            const newPlanId = await cloneDietTemplateToPatient(
                selectedTemplate.id,
                patientId,
                nutritionistId,
                selectedTemplate.name
            );
            
            if (!hasGhostFoods) {
                toast({ title: 'Protocolo Aplicado!', description: `"${selectedTemplate.name}" importado com sucesso.` });
            }
            
            if (onTemplateApplied) {
                const { data: newPlan } = await getMealPlanById(newPlanId);
                onTemplateApplied(newPlan || { id: newPlanId });
            }
            onOpenChange(false);
        } catch (error) {
            console.error('Erro ao aplicar template:', error);
            toast({ title: 'Erro', description: 'Falha ao importar o protocolo.', variant: 'destructive' });
        } finally {
            setApplying(false);
        }
    };

    const filtered = (templates || []).filter(t =>
        !searchTerm ||
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Calcular totais do template
    const totals = templateDetail
        ? (templateDetail.meals || []).reduce((acc, m) => ({
            cal: acc.cal + (m.calories || 0),
            prot: acc.prot + (m.protein || 0),
            carbs: acc.carbs + (m.carbs || 0),
            fat: acc.fat + (m.fat || 0),
        }), { cal: 0, prot: 0, carbs: 0, fat: 0 })
        : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        Importar Protocolo de Dieta
                    </DialogTitle>
                    <DialogDescription>
                        Selecione um protocolo e confira o resumo antes de aplicar ao paciente.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 gap-0 overflow-hidden mt-3 min-h-0">

                    {/* ── Esquerda: Lista ── */}
                    <div className="w-[42%] flex flex-col border-r pr-5 min-h-0">
                        <div className="relative mb-3 flex-shrink-0">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar protocolo..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <ScrollArea className="flex-1">
                            {loadingTemplates ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p className="text-sm">Nenhum protocolo encontrado</p>
                                </div>
                            ) : (
                                <div className="space-y-2 pr-2">
                                    {filtered.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setSelectedTemplate(t)}
                                            className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                                                selectedTemplate?.id === t.id
                                                    ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                                                    : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-semibold text-sm text-slate-800 truncate">{t.name}</h3>
                                                    {t.description && (
                                                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{t.description}</p>
                                                    )}
                                                </div>
                                                {selectedTemplate?.id === t.id && (
                                                    <ChevronRight className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                                )}
                                            </div>
                                            {t.tags && t.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {t.tags.slice(0, 3).map((tag, i) => (
                                                        <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                                            <Tag className="w-2.5 h-2.5 mr-1" />{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* ── Direita: Preview ── */}
                    <div className="flex-1 flex flex-col pl-5 min-h-0 overflow-hidden">
                        {!selectedTemplate ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                <FileText className="w-12 h-12 opacity-15" />
                                <p className="text-sm">Selecione um protocolo para ver o resumo</p>
                            </div>
                        ) : loadingDetail ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <ScrollArea className="flex-1">
                                <div className="space-y-4 pr-1">
                                    {/* Header do protocolo */}
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">{selectedTemplate.name}</h3>
                                        {selectedTemplate.description && (
                                            <p className="text-sm text-slate-500 mt-0.5">{selectedTemplate.description}</p>
                                        )}
                                    </div>

                                    {/* Adequação energética */}
                                    {totals && (
                                        <div>
                                            <AdequacyBadge planKcal={totals.cal} targetKcal={energyTarget} />
                                            {!energyTarget && (
                                                <p className="text-xs text-slate-400 mt-1">
                                                    Sem cálculo de gasto energético cadastrado para comparação.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Cards de macros */}
                                    {totals && (
                                        <div className="grid grid-cols-2 gap-2">
                                            {/* Calorias */}
                                            <div className="col-span-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-3.5 text-white">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <Flame className="w-4 h-4 opacity-80" />
                                                    <span className="text-xs font-medium opacity-80">Total de Calorias</span>
                                                </div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-3xl font-bold">{Math.round(totals.cal)}</span>
                                                    <span className="text-sm opacity-75">kcal/dia</span>
                                                    {energyTarget && (
                                                        <span className="ml-auto text-xs opacity-75 bg-white/20 px-2 py-0.5 rounded-full">
                                                            meta: {Math.round(energyTarget)} kcal
                                                        </span>
                                                    )}
                                                </div>
                                                {energyTarget && (
                                                    <div className="mt-2 h-1.5 bg-white/30 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-white rounded-full"
                                                            style={{ width: `${Math.min(100, (totals.cal / energyTarget) * 100)}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Macros individuais */}
                                            {[
                                                { label: 'Proteínas', value: totals.prot, icon: Beef, color: 'bg-rose-100 text-rose-700', unit: 'g', kcal: totals.prot * 4 },
                                                { label: 'Carboidratos', value: totals.carbs, icon: Wheat, color: 'bg-amber-100 text-amber-700', unit: 'g', kcal: totals.carbs * 4 },
                                                { label: 'Gorduras', value: totals.fat, icon: Droplets, color: 'bg-blue-100 text-blue-700', unit: 'g', kcal: totals.fat * 9 },
                                            ].map(({ label, value, icon: Icon, color, unit, kcal }) => (
                                                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${color} mb-2`}>
                                                        <Icon className="w-3 h-3" />
                                                        {label}
                                                    </div>
                                                    <p className="text-xl font-bold text-slate-800">{value.toFixed(1)}<span className="text-xs font-normal text-slate-400 ml-0.5">{unit}</span></p>
                                                    <p className="text-xs text-slate-400 mt-0.5">{Math.round(kcal)} kcal · {totals.cal > 0 ? Math.round((kcal / totals.cal) * 100) : 0}%</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Dias da semana */}
                                    {selectedTemplate.active_days?.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dias Ativos</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                {DAY_ORDER.map(day => {
                                                    const active = selectedTemplate.active_days.includes(day);
                                                    return (
                                                        <span key={day} className={`text-xs px-2 py-1 rounded-md font-medium ${
                                                            active
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-slate-100 text-slate-300'
                                                        }`}>
                                                            {DAY_LABELS[day]}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Lista de refeições */}
                                    {templateDetail?.meals?.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Utensils className="w-4 h-4 text-slate-400" />
                                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                    {templateDetail.meals.length} Refeição(ões)
                                                </span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {templateDetail.meals.map((meal, i) => (
                                                    <div key={meal.id ?? i} className="flex items-center justify-between bg-white rounded-lg border border-slate-100 px-3 py-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-xs text-slate-400 flex-shrink-0">#{i + 1}</span>
                                                            <span className="text-sm font-medium text-slate-700 truncate">{meal.name}</span>
                                                            {meal.meal_time && (
                                                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 flex-shrink-0">{meal.meal_time}</Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                            <span className="text-xs text-slate-400">{meal.foods?.length || 0} alim.</span>
                                                            <span className="text-xs font-semibold text-emerald-700">{Math.round(meal.calories || 0)} kcal</span>
                                                            {(meal.foods || []).some(f => !f.food || f.food.is_active === false) && (
                                                                <Badge variant="destructive" className="text-[10px] py-0 px-1 bg-red-100 text-red-700 border-red-200">
                                                                    ⚠ Aviso
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        )}

                        {/* Botão de confirmação */}
                        {selectedTemplate && (
                            <div className="pt-4 mt-2 border-t flex-shrink-0">
                                <Button
                                    onClick={handleApplyTemplate}
                                    disabled={applying || !patientId}
                                    className="w-full h-11 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    {applying ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
                                    ) : (
                                        `Aplicar "${selectedTemplate.name}" ao Paciente`
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
