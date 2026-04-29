import React, { useState, useEffect } from 'react';
import { X, Package, Database, Leaf, Zap, Droplets, Activity, Info, ChevronRight } from 'lucide-react';
import { getFoodMeasures } from '@/lib/supabase/foodService';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const SOURCE_CONFIG = {
    'TACO':      { label: 'TACO — Tabela Brasileira de Composição de Alimentos (UNICAMP)', short: 'TACO',      color: 'bg-blue-50 text-blue-700 border-blue-200' },
    'TBCA':      { label: 'TBCA — Tabela Brasileira de Composição de Alimentos (USP)',     short: 'TBCA',      color: 'bg-pink-50 text-pink-700 border-pink-200' },
    'USDA':      { label: 'USDA — United States Department of Agriculture',                short: 'USDA',      color: 'bg-violet-50 text-violet-700 border-violet-200' },
    'TUCUNDUVA': { label: 'Tabela Tucunduva',                                              short: 'Tucunduva', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    'Nello':     { label: 'Banco Nello',                                                   short: 'Nello',     color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    'custom':    { label: 'Alimento Personalizado',                                        short: 'Pessoal',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const fmt = (v, d = 1) => (v != null && !isNaN(v) ? Number(v).toFixed(d) : null);
const fmtInt = (v) => (v != null && !isNaN(v) ? Math.round(v) : null);

// Barra de macros tipo semáforo
const MacroBar = ({ protein, carbs, fat }) => {
    const total = (protein || 0) + (carbs || 0) + (fat || 0);
    if (!total) return null;
    const pPct = Math.round((protein / total) * 100);
    const cPct = Math.round((carbs / total) * 100);
    const fPct = 100 - pPct - cPct;
    return (
        <div className="flex h-2 w-full rounded-full overflow-hidden gap-px">
            <div className="bg-violet-500" style={{ width: `${pPct}%` }} title={`Proteína ${pPct}%`} />
            <div className="bg-blue-400" style={{ width: `${cPct}%` }} title={`Carboidratos ${cPct}%`} />
            <div className="bg-orange-400" style={{ width: `${fPct}%` }} title={`Gordura ${fPct}%`} />
        </div>
    );
};

// Célula de nutriente grande (macros hero)
const MacroHero = ({ value, unit, label, bg, text }) => (
    <div className={`flex-1 rounded-xl p-3 text-center ${bg}`}>
        <p className={`text-2xl font-bold ${text}`}>{value ?? '—'}</p>
        <p className="text-xs text-slate-500 mt-0.5">{unit}</p>
        <p className="text-xs font-semibold text-slate-600 mt-1">{label}</p>
    </div>
);

// Linha de micronutriente
const MicroRow = ({ label, value, unit }) => {
    if (value == null) return null;
    return (
        <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
            <span className="text-sm text-slate-600">{label}</span>
            <span className="text-sm font-semibold text-slate-800">{value} <span className="text-slate-400 font-normal">{unit}</span></span>
        </div>
    );
};

const FoodDetailsDialog = ({ food, open, onOpenChange }) => {
    const [displayFood, setDisplayFood] = useState(food);
    const [activeTab, setActiveTab] = useState('macros');

    useEffect(() => { setDisplayFood(food); setActiveTab('macros'); }, [food]);
    useEffect(() => {
        if (open && food?.id && (!food.food_measures || food.food_measures.length === 0)) {
            getFoodMeasures(food.id).then((measures) => {
                setDisplayFood(prev => prev?.id === food.id ? { ...prev, food_measures: measures } : prev);
            });
        }
    }, [open, food?.id]);

    const f = displayFood || food;
    if (!f) return null;

    const src = SOURCE_CONFIG[f.source] || { label: f.source, short: f.source, color: 'bg-slate-100 text-slate-600 border-slate-200' };
    const cal = fmtInt(f.calories);
    const hasMicros = f.calcium || f.iron || f.magnesium || f.phosphorus || f.potassium || f.zinc ||
                      f.vitamin_a || f.vitamin_c || f.vitamin_d || f.vitamin_e || f.vitamin_b12 || f.folate;
    const hasDetails = f.fiber || f.sugar || f.saturated_fat || f.trans_fat || f.cholesterol || f.sodium;

    const TABS = [
        { id: 'macros', label: 'Macros' },
        { id: 'micros', label: 'Micros', disabled: !hasMicros },
        { id: 'info',   label: 'Informações' },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg w-[95vw] p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl">

                {/* ── Header colorido ─────────────────────────────────────── */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-700 text-white px-5 pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <Badge className={`${src.color} border text-xs font-semibold mb-2`}>{src.short}</Badge>
                            <h2 className="text-lg font-bold text-white leading-tight break-words">{f.name}</h2>
                            {f.group && <p className="text-slate-300 text-xs mt-1">{f.group}</p>}
                        </div>
                        <button onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors shrink-0">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Caloria grande */}
                    {cal && (
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">{cal}</span>
                            <span className="text-slate-300 text-sm">kcal por 100g</span>
                        </div>
                    )}

                    {/* Barra de macros */}
                    <div className="mt-3 space-y-1">
                        <MacroBar protein={f.protein} carbs={f.carbs} fat={f.fat} />
                        <div className="flex gap-4 text-xs text-slate-300">
                            <span><span className="w-2 h-2 rounded-full bg-violet-500 inline-block mr-1" />P: {fmt(f.protein) ?? '—'}g</span>
                            <span><span className="w-2 h-2 rounded-full bg-blue-400 inline-block mr-1" />C: {fmt(f.carbs) ?? '—'}g</span>
                            <span><span className="w-2 h-2 rounded-full bg-orange-400 inline-block mr-1" />G: {fmt(f.fat) ?? '—'}g</span>
                        </div>
                    </div>
                </div>

                {/* ── Tabs ─────────────────────────────────────────────────── */}
                <div className="flex bg-white border-b border-slate-100 px-4">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => !t.disabled && setActiveTab(t.id)}
                            disabled={t.disabled}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                t.disabled ? 'text-slate-300 cursor-not-allowed border-transparent' :
                                activeTab === t.id
                                    ? 'text-emerald-700 border-emerald-600'
                                    : 'text-slate-500 border-transparent hover:text-slate-800'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Conteúdo ─────────────────────────────────────────────── */}
                <ScrollArea className="max-h-[55vh]">
                    <div className="p-5 bg-slate-50">

                        {/* TAB: Macros */}
                        {activeTab === 'macros' && (
                            <div className="space-y-4">
                                {/* Heroes */}
                                <div className="flex gap-2">
                                    <MacroHero value={fmt(f.protein)} unit="g" label="Proteína"    bg="bg-violet-50" text="text-violet-700" />
                                    <MacroHero value={fmt(f.carbs)}   unit="g" label="Carboidratos" bg="bg-blue-50"   text="text-blue-700" />
                                    <MacroHero value={fmt(f.fat)}     unit="g" label="Gorduras"     bg="bg-orange-50" text="text-orange-600" />
                                </div>

                                {/* Detalhes extras */}
                                {hasDetails && (
                                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                                        <div className="px-4 py-2.5 flex items-center gap-2">
                                            <Leaf className="w-4 h-4 text-green-500" />
                                            <span className="text-sm font-semibold text-slate-700">Detalhes</span>
                                        </div>
                                        <div className="px-4">
                                            <MicroRow label="Fibra alimentar" value={fmt(f.fiber)} unit="g" />
                                            <MicroRow label="Açúcares totais" value={fmt(f.sugar)} unit="g" />
                                            <MicroRow label="Gordura saturada" value={fmt(f.saturated_fat)} unit="g" />
                                            <MicroRow label="Gordura trans" value={fmt(f.trans_fat)} unit="g" />
                                            <MicroRow label="Colesterol" value={fmtInt(f.cholesterol)} unit="mg" />
                                            <MicroRow label="Sódio" value={fmtInt(f.sodium)} unit="mg" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB: Micros */}
                        {activeTab === 'micros' && (
                            <div className="space-y-3">
                                {/* Minerais */}
                                {(f.calcium || f.iron || f.magnesium || f.phosphorus || f.potassium || f.zinc) && (
                                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                                        <div className="px-4 py-2.5 flex items-center gap-2">
                                            <Droplets className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm font-semibold text-slate-700">Minerais</span>
                                        </div>
                                        <div className="px-4">
                                            <MicroRow label="Cálcio" value={fmt(f.calcium)} unit="mg" />
                                            <MicroRow label="Ferro" value={fmt(f.iron)} unit="mg" />
                                            <MicroRow label="Magnésio" value={fmt(f.magnesium)} unit="mg" />
                                            <MicroRow label="Fósforo" value={fmt(f.phosphorus)} unit="mg" />
                                            <MicroRow label="Potássio" value={fmt(f.potassium)} unit="mg" />
                                            <MicroRow label="Zinco" value={fmt(f.zinc)} unit="mg" />
                                        </div>
                                    </div>
                                )}

                                {/* Vitaminas */}
                                {(f.vitamin_a || f.vitamin_c || f.vitamin_d || f.vitamin_e || f.vitamin_b12 || f.folate) && (
                                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                                        <div className="px-4 py-2.5 flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-amber-500" />
                                            <span className="text-sm font-semibold text-slate-700">Vitaminas</span>
                                        </div>
                                        <div className="px-4">
                                            <MicroRow label="Vitamina A" value={fmt(f.vitamin_a)} unit="mg" />
                                            <MicroRow label="Vitamina C" value={fmt(f.vitamin_c)} unit="mg" />
                                            <MicroRow label="Vitamina D" value={fmt(f.vitamin_d)} unit="mg" />
                                            <MicroRow label="Vitamina E" value={fmt(f.vitamin_e)} unit="mg" />
                                            <MicroRow label="Vitamina B12" value={fmt(f.vitamin_b12)} unit="mg" />
                                            <MicroRow label="Folato" value={fmt(f.folate)} unit="mg" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB: Informações */}
                        {activeTab === 'info' && (
                            <div className="space-y-3">
                                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                                    <div className="px-4 py-2.5 flex items-center gap-2">
                                        <Info className="w-4 h-4 text-slate-400" />
                                        <span className="text-sm font-semibold text-slate-700">Informações gerais</span>
                                    </div>
                                    <div className="px-4 py-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-500">Fonte</span>
                                            <Badge className={`${src.color} border text-xs`}>{src.label}</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-500">Porção padrão</span>
                                            <span className="text-sm font-semibold text-slate-800">{f.portion_size || 100}g</span>
                                        </div>
                                        {f.base_unit && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-500">Unidade base</span>
                                                <span className="text-sm font-semibold text-slate-800">{f.base_unit}</span>
                                            </div>
                                        )}
                                    </div>
                                    {f.description && (
                                        <div className="px-4 py-3">
                                            <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">Descrição</p>
                                            <p className="text-sm text-slate-700 leading-relaxed">{f.description}</p>
                                        </div>
                                    )}
                                    {f.preparation && (
                                        <div className="px-4 py-3">
                                            <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">Modo de preparo</p>
                                            <p className="text-sm text-slate-700 leading-relaxed">{f.preparation}</p>
                                        </div>
                                    )}
                                </div>

                                {f.food_measures && f.food_measures.length > 0 && (
                                    <div className="bg-white rounded-xl border border-slate-200">
                                        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-emerald-500" />
                                            <span className="text-sm font-semibold text-slate-700">Medidas caseiras</span>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {f.food_measures.map(m => (
                                                <div key={m.id} className="px-4 py-2.5 flex items-center justify-between">
                                                    <span className="text-sm text-slate-700">{m.measure_label}</span>
                                                    <span className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                                                        {m.quantity_grams}g <ChevronRight className="w-3 h-3 text-slate-300" />
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

export default FoodDetailsDialog;
