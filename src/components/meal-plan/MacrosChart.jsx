import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flame, Target, BarChart3, Beaker, PieChart as PieChartIcon, ArrowRight } from 'lucide-react';
import ReferenceValuesModal from './ReferenceValuesModal';

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

const calculateMicros = (plan) => {
    if (!plan?.meals) return {};
    const totals = {};
    Object.keys(COMPACT_DRI).forEach(n => { totals[n] = 0; });

    plan.meals.forEach(meal => {
        (meal.foods || []).forEach(foodItem => {
            if (foodItem.food) {
                Object.keys(COMPACT_DRI).forEach(nutrient => {
                    const val = parseFloat(foodItem.food[nutrient]) || 0;
                    if (val > 0) {
                        totals[nutrient] += val * (foodItem.quantity / 100);
                    }
                });
            }
        });
    });
    return totals;
};

const MacrosChart = ({ protein, carbs, fat, calories, patientId, patientSlugOrId, planId, readOnly = false, plan = null, activePlanId = null, onReferenceUpdate }) => {
    const navigate = useNavigate();
    const patientSegment = patientSlugOrId ?? patientId;
    const [showReferenceModal, setShowReferenceModal] = useState(false);
    const [activeTab, setActiveTab] = useState('macros');

    const summaryPlanId = readOnly ? (activePlanId || planId) : planId;

    const colors = {
        protein: '#8B3BF2',
        carbs: '#3B6FF2',
        fat: '#F28B3B',
    };

    const totalMacroCals = (protein * 4) + (carbs * 4) + (fat * 9);
    const pPerc = totalMacroCals > 0 ? ((protein * 4) / totalMacroCals) * 100 : 0;
    const cPerc = totalMacroCals > 0 ? ((carbs * 4) / totalMacroCals) * 100 : 0;
    const fPerc = totalMacroCals > 0 ? ((fat * 9) / totalMacroCals) * 100 : 0;

    const microTotals = useMemo(() => calculateMicros(plan), [plan]);

    const PieChartSVG = () => {
        const size = 160;
        const radius = 64;
        const centerX = size / 2;
        const centerY = size / 2;
        const strokeWidth = 14;

        const polarToCartesian = (cx, cy, r, angleInDeg) => {
            const rad = (angleInDeg - 90) * Math.PI / 180.0;
            return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
        };

        const getArcPath = (startAngle, endAngle) => {
            if (endAngle - startAngle === 360) {
                return `M ${centerX} ${centerY - radius} A ${radius} ${radius} 0 1 1 ${centerX} ${centerY + radius} A ${radius} ${radius} 0 1 1 ${centerX} ${centerY - radius}`;
            }
            const start = polarToCartesian(centerX, centerY, radius, endAngle);
            const end = polarToCartesian(centerX, centerY, radius, startAngle);
            const large = endAngle - startAngle <= 180 ? '0' : '1';
            return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 0 ${end.x} ${end.y}`;
        };

        const pAngle = (pPerc / 100) * 360;
        const cAngle = (cPerc / 100) * 360;

        const slices = [
            { key: 'protein', start: 0, end: pAngle, color: colors.protein },
            { key: 'carbs', start: pAngle, end: pAngle + cAngle, color: colors.carbs },
            { key: 'fat', start: pAngle + cAngle, end: 360, color: colors.fat },
        ];

        return (
            <div className="flex justify-center mb-6 relative">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {/* Background track */}
                    <circle cx={centerX} cy={centerY} r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth={strokeWidth} />
                    {/* Slices */}
                    {totalMacroCals > 0 && slices.map(s => s.end - s.start > 0 && (
                        <path
                            key={s.key}
                            d={getArcPath(s.start, s.end)}
                            fill="transparent"
                            stroke={s.color}
                            strokeWidth={strokeWidth}
                            strokeLinecap={s.end - s.start < 360 ? "round" : "butt"}
                            className="drop-shadow-sm transition-all duration-300"
                        />
                    ))}
                    {/* Circular Fix: Draw the start cap of the first valid slice on top of the last slice */}
                    {totalMacroCals > 0 && slices.filter(s => s.end - s.start > 0).length > 1 && (
                        <path
                            d={getArcPath(0, 0.01)}
                            fill="transparent"
                            stroke={slices.find(s => s.end - s.start > 0)?.color}
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                        />
                    )}
                    {/* Center Text */}
                    <text x={centerX} y={centerY + 4} textAnchor="middle" className="text-3xl font-bold fill-foreground">{calories.toFixed(0)}</text>
                    <text x={centerX} y={centerY + 20} textAnchor="middle" className="text-[10px] font-semibold fill-muted-foreground uppercase tracking-widest">Kcal</text>
                </svg>
            </div>
        );
    };

    const MacrosView = () => (
        <div className="flex flex-col h-full justify-center pb-2">
            <PieChartSVG />
            <div className="grid grid-cols-3 gap-2 px-2 mt-2">
                {[
                    { label: 'Carboidratos', value: carbs, color: colors.carbs },
                    { label: 'Proteínas', value: protein, color: colors.protein },
                    { label: 'Gorduras', value: fat, color: colors.fat }
                ].map(m => (
                    <div key={m.label} className="flex flex-col items-center rounded-lg p-2" style={{ backgroundColor: m.color, color: 'white' }}>
                        <div className="flex items-center gap-1.5 mb-1 text-center">
                            <span className="text-[10px] font-medium text-white/90 leading-none">{m.label}</span>
                        </div>
                        <div className="flex items-baseline gap-0.5">
                            <span className="text-sm font-bold text-white">{m.value.toFixed(1)}</span>
                            <span className="text-[10px] font-medium text-white/70">g</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const MicrosView = () => {
        const hasData = Object.values(microTotals).some(v => v > 0);

        if (!plan || !hasData) {
            return (
                <div className="flex flex-col items-center justify-center pt-10 text-center space-y-3 px-4">
                    <Beaker className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">Nenhum dado de micronutriente</p>
                    <p className="text-xs text-muted-foreground/70">As informações dependem do cadastro detalhado dos alimentos.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col justify-center h-full space-y-0.5">
                {Object.entries(COMPACT_DRI).map(([key, dri]) => {
                    const value = microTotals[key] || 0;
                    const pct = dri.value > 0 ? (value / dri.value) * 100 : 0;
                    const cappedPct = Math.min(pct, 100);

                    const isLimit = dri.isLimit;
                    const isSafe = isLimit ? pct <= 100 : pct >= 100;
                    const barColor = isSafe ? 'bg-green-500' : (isLimit ? 'bg-red-500' : 'bg-yellow-500');

                    return (
                        <div key={key} className="space-y-1 bg-white border border-border/60 rounded-md p-1.5 px-2">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 text-foreground font-medium">
                                    <span>{dri.icon}</span>
                                    <span>{dri.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-foreground">{value.toFixed(1)} <span className="text-[10px] text-muted-foreground font-normal">{dri.unit}</span></span>
                                    <span className="text-[10px] text-muted-foreground">/ {dri.value}{dri.unit}</span>
                                </div>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                                    style={{ width: `${Math.max(cappedPct, 2)}%` }} // Minimum width for visibility
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Card className="h-full flex flex-col bg-background border-border shadow-sm">
            <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-base font-semibold flex items-center justify-center w-full">
                    <div className="flex items-center gap-2 text-foreground">
                        <Flame className="w-4 h-4 text-[#c4661f]" />
                        Análise&nbsp;&nbsp;&nbsp;Nutricional
                    </div>
                </CardTitle>

                {/* Tabs */}
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => setActiveTab('macros')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                            activeTab === 'macros'
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-white text-muted-foreground border-border hover:bg-muted'
                        }`}
                    >
                        <PieChartIcon className="w-3.5 h-3.5" />
                        Macronutrientes
                    </button>
                    <button
                        onClick={() => setActiveTab('micros')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                            activeTab === 'micros'
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-white text-muted-foreground border-border hover:bg-muted'
                        }`}
                    >
                        <Beaker className="w-3.5 h-3.5" />
                        Micronutrientes
                    </button>
                </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col pt-2 pb-5">
                {/* Fixed Height Container: exact space needed to hold exactly the micros list with no jumps and no scroll. */}
                <div className="h-[350px]">
                    {activeTab === 'macros' ? <MacrosView /> : <MicrosView />}
                </div>

                {/* Footer Buttons */}
                {!readOnly && (
                    <div className="pt-4 mt-auto border-t space-y-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowReferenceModal(true)} className="w-full gap-2">
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
