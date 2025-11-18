import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flame, Target, BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import ReferenceValuesModal from './ReferenceValuesModal';

/**
 * MacrosChart - Gráfico de pizza de distribuição de macronutrientes
 * Mostra porcentagens, g/kg e compara com valores de referência
 */
const MacrosChart = ({ protein, carbs, fat, calories, patientId, planId, referenceValues, onReferenceUpdate, readOnly = false }) => {
    const navigate = useNavigate();
    const [showReferenceModal, setShowReferenceModal] = useState(false);

    // Cores dos macronutrientes
    const colors = {
        protein: '#8B3BF2',  // Roxo
        carbs: '#3B6FF2',    // Azul
        fat: '#F28B3B'       // Laranja
    };

    // Calcular calorias de cada macro (prot e carbs = 4kcal/g, gordura = 9kcal/g)
    const proteinCals = protein * 4;
    const carbsCals = carbs * 4;
    const fatCals = fat * 9;
    const totalMacroCals = proteinCals + carbsCals + fatCals;

    // Calcular porcentagens
    const proteinPerc = totalMacroCals > 0 ? (proteinCals / totalMacroCals) * 100 : 0;
    const carbsPerc = totalMacroCals > 0 ? (carbsCals / totalMacroCals) * 100 : 0;
    const fatPerc = totalMacroCals > 0 ? (fatCals / totalMacroCals) * 100 : 0;

    // Calcular g/kg se tivermos peso
    const weight = referenceValues?.weight_kg ? parseFloat(referenceValues.weight_kg) : null;
    const proteinPerKg = weight ? protein / weight : null;
    const carbsPerKg = weight ? carbs / weight : null;
    const fatPerKg = weight ? fat / weight : null;

    // Calcular targets baseado nos valores de referência
    const calculateTargets = () => {
        if (!referenceValues) return null;

        const weight = parseFloat(referenceValues.weight_kg);
        const energy = parseFloat(referenceValues.total_energy_kcal);

        if (!weight || !energy) return null;

        let proteinG, carbsG, fatG;

        if (referenceValues.macro_mode === 'percentage') {
            proteinG = (energy * referenceValues.protein_percentage) / 4;
            carbsG = (energy * referenceValues.carbs_percentage) / 4;
            fatG = (energy * referenceValues.fat_percentage) / 9;
        } else {
            proteinG = weight * referenceValues.protein_g_per_kg;
            carbsG = weight * referenceValues.carbs_g_per_kg;
            fatG = weight * referenceValues.fat_g_per_kg;
        }

        return {
            calories: energy,
            protein: proteinG,
            carbs: carbsG,
            fat: fatG,
            proteinPerKg: proteinG / weight,
            carbsPerKg: carbsG / weight,
            fatPerKg: fatG / weight
        };
    };

    const targets = calculateTargets();

    // Calcular adequação e status
    const getAdequacyData = (current, target) => {
        if (!target || target === 0) return null;

        const percentage = (current / target) * 100;
        const diff = current - target;
        const diffPerc = percentage - 100;

        let status = 'adequate'; // verde
        if (percentage < 95 || percentage > 105) {
            status = 'inadequate'; // vermelho
        } else if (percentage < 100) {
            status = 'below'; // amarelo baixo
        } else if (percentage > 100) {
            status = 'above'; // amarelo alto
        }

        return {
            percentage: percentage,
            diff: diff,
            diffPerc: diffPerc,
            status: status
        };
    };

    const caloriesAdequacy = targets ? getAdequacyData(calories, targets.calories) : null;
    const proteinAdequacy = targets ? getAdequacyData(protein, targets.protein) : null;
    const carbsAdequacy = targets ? getAdequacyData(carbs, targets.carbs) : null;
    const fatAdequacy = targets ? getAdequacyData(fat, targets.fat) : null;

    // Componente de Badge de Adequação
    const AdequacyBadge = ({ adequacy, compact = false }) => {
        if (!adequacy) return null;

        const getStatusConfig = (status) => {
            switch (status) {
                case 'adequate':
                    return {
                        color: 'bg-green-100 text-green-700 border-green-300',
                        icon: <Minus className="w-3 h-3" />,
                        label: 'OK'
                    };
                case 'below':
                    return {
                        color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
                        icon: <TrendingDown className="w-3 h-3" />,
                        label: adequacy.diffPerc.toFixed(0)
                    };
                case 'above':
                    return {
                        color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
                        icon: <TrendingUp className="w-3 h-3" />,
                        label: `+${adequacy.diffPerc.toFixed(0)}`
                    };
                case 'inadequate':
                    return {
                        color: adequacy.percentage < 95
                            ? 'bg-red-100 text-red-700 border-red-300'
                            : 'bg-orange-100 text-orange-700 border-orange-300',
                        icon: adequacy.percentage < 95
                            ? <TrendingDown className="w-3 h-3" />
                            : <TrendingUp className="w-3 h-3" />,
                        label: adequacy.percentage < 95
                            ? adequacy.diffPerc.toFixed(0)
                            : `+${adequacy.diffPerc.toFixed(0)}`
                    };
                default:
                    return null;
            }
        };

        const config = getStatusConfig(adequacy.status);
        if (!config) return null;

        if (compact) {
            return (
                <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-xs font-semibold ${config.color}`}>
                    {config.icon}
                    <span>{config.label}%</span>
                </div>
            );
        }

        return (
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold ${config.color}`}>
                {config.icon}
                <span>{adequacy.percentage.toFixed(0)}%</span>
            </div>
        );
    };

    // Gráfico de pizza SVG
    const PieChart = () => {
        const size = 150;
        const radius = 60;
        const centerX = size / 2;
        const centerY = size / 2;

        const getArcPath = (startAngle, endAngle) => {
            const start = polarToCartesian(centerX, centerY, radius, endAngle);
            const end = polarToCartesian(centerX, centerY, radius, startAngle);
            const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

            return [
                'M', centerX, centerY,
                'L', start.x, start.y,
                'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
                'Z'
            ].join(' ');
        };

        const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
            const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
            return {
                x: centerX + (radius * Math.cos(angleInRadians)),
                y: centerY + (radius * Math.sin(angleInRadians))
            };
        };

        let currentAngle = 0;
        const proteinAngle = (proteinPerc / 100) * 360;
        const carbsAngle = (carbsPerc / 100) * 360;
        const fatAngle = (fatPerc / 100) * 360;

        return (
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
                {/* Proteína */}
                {proteinPerc > 0 && (
                    <path
                        d={getArcPath(currentAngle, currentAngle + proteinAngle)}
                        fill={colors.protein}
                        opacity="0.9"
                        className="hover:opacity-100 transition-opacity cursor-pointer"
                    />
                )}

                {/* Carboidratos */}
                {carbsPerc > 0 && (
                    <path
                        d={getArcPath(currentAngle + proteinAngle, currentAngle + proteinAngle + carbsAngle)}
                        fill={colors.carbs}
                        opacity="0.9"
                        className="hover:opacity-100 transition-opacity cursor-pointer"
                    />
                )}

                {/* Gorduras */}
                {fatPerc > 0 && (
                    <path
                        d={getArcPath(currentAngle + proteinAngle + carbsAngle, 360)}
                        fill={colors.fat}
                        opacity="0.9"
                        className="hover:opacity-100 transition-opacity cursor-pointer"
                    />
                )}

                {/* Círculo branco central */}
                <circle cx={centerX} cy={centerY} r={38} fill="#fefae0" />

                {/* Texto central - Total de calorias */}
                <text
                    x={centerX}
                    y={centerY - 3}
                    textAnchor="middle"
                    className="text-xl font-bold"
                    fill="#000"
                >
                    {calories.toFixed(0)}
                </text>
                <text
                    x={centerX}
                    y={centerY + 12}
                    textAnchor="middle"
                    className="text-[10px]"
                    fill="#666"
                >
                    kcal
                </text>
            </svg>
        );
    };

    // Linha de Nutriente (Energia ou Macro)
    const NutrientRow = ({
        label,
        color,
        current,
        target,
        currentPerKg,
        targetPerKg,
        percentage,
        adequacy,
        unit = 'g',
        isEnergy = false
    }) => {
        return (
            <div className={`p-2 rounded-lg border transition-colors`}
            style={color ? {
                backgroundColor: `${color}0D`,
                borderColor: `${color}33`,
            } : {
                backgroundColor: 'rgb(250 250 249 / 0.3)',
                borderColor: 'rgb(228 228 231)',
            }}
            >
                {/* Linha Principal */}
                <div className="flex items-center justify-between gap-2 mb-0.5">
                    {/* Label com Indicador */}
                    <div className="flex items-center gap-1.5">
                        {color && !isEnergy && (
                            <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color }}
                            />
                        )}
                        {isEnergy && <Flame className="w-3 h-3 text-[#c4661f]" />}
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                            color && !isEnergy ? '' : 'text-muted-foreground'
                        }`}
                        style={color && !isEnergy ? { color: color } : undefined}
                        >
                            {label}
                        </span>
                    </div>

                    {/* Badge de Adequação */}
                    {adequacy && (
                        <AdequacyBadge adequacy={adequacy} compact />
                    )}
                </div>

                {/* Valores */}
                <div className="flex items-baseline justify-between gap-2 flex-wrap min-w-0">
                    {/* Coluna Esquerda: Valor Atual */}
                    <div className="flex items-baseline gap-1 flex-wrap min-w-0">
                        <span className={`text-lg font-bold ${
                            color && !isEnergy ? '' : 'text-foreground'
                        }`}
                        style={color && !isEnergy ? { color: color } : undefined}
                        >
                            {current.toFixed(isEnergy ? 0 : 1)}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium">{unit}</span>

                        {/* g/kg */}
                        {currentPerKg && !isEnergy && (
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                ({currentPerKg.toFixed(1)} g/kg)
                            </span>
                        )}

                        {/* Percentual */}
                        {percentage !== undefined && !isEnergy && (
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                • {percentage.toFixed(0)}%
                            </span>
                        )}
                    </div>

                    {/* Coluna Direita: Meta (se existir) */}
                    {target && (
                        <div className="flex items-baseline gap-1 text-[10px] flex-wrap">
                            <span className="text-muted-foreground font-medium whitespace-nowrap">Meta:</span>
                            <span className="font-bold text-foreground whitespace-nowrap">
                                {target.toFixed(isEnergy ? 0 : 1)}{unit}
                            </span>
                            {targetPerKg && !isEnergy && (
                                <span className="text-muted-foreground whitespace-nowrap">
                                    ({targetPerKg.toFixed(1)} g/kg)
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <Card className="h-full bg-gradient-to-br from-[#fefae0]/30 to-[#f9ebc7]/30 border-[#a9b388]">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Flame className="w-4 h-4 text-[#c4661f]" />
                        Distribuição de Macronutrientes
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-2">
                    {/* Gráfico de Pizza */}
                    <PieChart />

                    {/* Lista de Nutrientes */}
                    <div className="space-y-1">
                        {/* Energia (se houver valores de referência) */}
                        {targets && (
                            <NutrientRow
                                label="Energia"
                                current={calories}
                                target={targets.calories}
                                adequacy={caloriesAdequacy}
                                unit="kcal"
                                isEnergy={true}
                            />
                        )}

                        {/* Proteínas */}
                        <NutrientRow
                            label="Proteínas"
                            color={colors.protein}
                            current={protein}
                            target={targets?.protein}
                            currentPerKg={proteinPerKg}
                            targetPerKg={targets?.proteinPerKg}
                            percentage={proteinPerc}
                            adequacy={proteinAdequacy}
                        />

                        {/* Carboidratos */}
                        <NutrientRow
                            label="Carboidratos"
                            color={colors.carbs}
                            current={carbs}
                            target={targets?.carbs}
                            currentPerKg={carbsPerKg}
                            targetPerKg={targets?.carbsPerKg}
                            percentage={carbsPerc}
                            adequacy={carbsAdequacy}
                        />

                        {/* Gorduras */}
                        <NutrientRow
                            label="Gorduras"
                            color={colors.fat}
                            current={fat}
                            target={targets?.fat}
                            currentPerKg={fatPerKg}
                            targetPerKg={targets?.fatPerKg}
                            percentage={fatPerc}
                            adequacy={fatAdequacy}
                        />
                    </div>

                    {/* Resumo de Status */}
                    {targets && (
                        <div className="flex items-center justify-center pt-1 border-t">
                            {[caloriesAdequacy, proteinAdequacy, carbsAdequacy, fatAdequacy].every(a => a?.status === 'adequate') ? (
                                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                                    <span className="font-medium">Plano adequado</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-full border border-yellow-200">
                                    <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
                                    <span className="font-medium">Ajustes sugeridos</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Botões de Ação - só aparece quando não é readOnly */}
                    {!readOnly && (
                        <div className="pt-1.5 border-t space-y-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowReferenceModal(true)}
                                className="w-full gap-2"
                            >
                                <Target className="w-4 h-4" />
                                {targets ? 'Editar Valores de Referência' : 'Configurar Valores de Referência'}
                            </Button>

                            {planId && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan/${planId}/summary`)}
                                    className="w-full gap-2"
                                >
                                    <BarChart3 className="w-4 h-4" />
                                    Ver Resumo Nutricional Completo
                                </Button>
                            )}

                            {!targets && (
                                <div className="text-[10px] text-muted-foreground bg-[#fefae0] p-2 rounded-lg border border-[#a9b388]/30 text-center">
                                    💡 Configure os valores de referência para ver análise de adequação e g/kg
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modal de Valores de Referência */}
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
        </>
    );
};

export default MacrosChart;
