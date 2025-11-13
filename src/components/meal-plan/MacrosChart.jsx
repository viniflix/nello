import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flame, AlertTriangle, CheckCircle, Target } from 'lucide-react';
import ReferenceValuesModal from './ReferenceValuesModal';

/**
 * MacrosChart - Gráfico de pizza de distribuição de macronutrientes
 * Mostra porcentagens e compara com valores de referência
 */
const MacrosChart = ({ protein, carbs, fat, calories, patientId, referenceValues, onReferenceUpdate }) => {
    const [showReferenceModal, setShowReferenceModal] = useState(false);

    // Calcular calorias de cada macro (prot e carbs = 4kcal/g, gordura = 9kcal/g)
    const proteinCals = protein * 4;
    const carbsCals = carbs * 4;
    const fatCals = fat * 9;

    const totalMacroCals = proteinCals + carbsCals + fatCals;

    // Calcular porcentagens
    const proteinPerc = totalMacroCals > 0 ? (proteinCals / totalMacroCals) * 100 : 0;
    const carbsPerc = totalMacroCals > 0 ? (carbsCals / totalMacroCals) * 100 : 0;
    const fatPerc = totalMacroCals > 0 ? (fatCals / totalMacroCals) * 100 : 0;

    // Cores do projeto
    const colors = {
        protein: '#783d19',
        carbs: '#5f6f52',
        fat: '#b99470'
    };

    // Criar o gráfico de pizza usando SVG
    const PieChart = () => {
        const size = 200;
        const radius = 80;
        const centerX = size / 2;
        const centerY = size / 2;

        // Calcular coordenadas do arco
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

        // Ângulos de cada fatia
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
                <circle cx={centerX} cy={centerY} r={50} fill="#fefae0" />

                {/* Texto central - Total de calorias */}
                <text
                    x={centerX}
                    y={centerY - 5}
                    textAnchor="middle"
                    className="text-2xl font-bold"
                    fill="#000"
                >
                    {calories.toFixed(0)}
                </text>
                <text
                    x={centerX}
                    y={centerY + 15}
                    textAnchor="middle"
                    className="text-xs"
                    fill="#666"
                >
                    kcal
                </text>
            </svg>
        );
    };

    // Verificar se valores estão dentro dos ranges de referência
    const checkMacroStatus = (macro, value) => {
        if (!referenceValues) return null;

        const ref = referenceValues[macro];
        if (!ref || !ref.min || !ref.max) return null;

        if (value < ref.min) {
            return { status: 'low', message: `Abaixo do ideal (${ref.min}-${ref.max}%)` };
        } else if (value > ref.max) {
            return { status: 'high', message: `Acima do ideal (${ref.min}-${ref.max}%)` };
        } else {
            return { status: 'ok', message: `Dentro do ideal (${ref.min}-${ref.max}%)` };
        }
    };

    const proteinStatus = checkMacroStatus('protein', proteinPerc);
    const carbsStatus = checkMacroStatus('carbs', carbsPerc);
    const fatStatus = checkMacroStatus('fat', fatPerc);

    const getStatusIcon = (status) => {
        if (!status) return null;
        if (status.status === 'ok') {
            return <CheckCircle className="w-4 h-4 text-green-600" />;
        }
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    };

    return (
        <>
            <Card className="h-full bg-gradient-to-br from-[#fefae0]/30 to-[#f9ebc7]/30 border-[#a9b388]">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Flame className="w-4 h-4 text-[#c4661f]" />
                            Distribuição de Macronutrientes
                        </CardTitle>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowReferenceModal(true)}
                            className="h-8 gap-1"
                        >
                            <Target className="w-3 h-3" />
                            <span className="text-xs">Valores de Referência</span>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Gráfico de Pizza */}
                    <PieChart />

                    {/* Legenda com valores */}
                    <div className="space-y-2">
                        {/* Proteínas */}
                        <div className="flex items-center justify-between p-2 bg-[#783d19]/10 rounded border border-[#783d19]/20">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.protein }} />
                                <span className="text-sm font-medium">Proteínas</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-right">
                                    <div className="text-sm font-bold text-[#783d19]">{protein.toFixed(1)}g</div>
                                    <div className="text-xs text-muted-foreground">{proteinPerc.toFixed(1)}%</div>
                                </div>
                                {proteinStatus && getStatusIcon(proteinStatus)}
                            </div>
                        </div>
                        {proteinStatus && proteinStatus.status !== 'ok' && (
                            <div className="text-xs text-yellow-700 pl-5">
                                {proteinStatus.message}
                            </div>
                        )}

                        {/* Carboidratos */}
                        <div className="flex items-center justify-between p-2 bg-[#5f6f52]/10 rounded border border-[#5f6f52]/20">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.carbs }} />
                                <span className="text-sm font-medium">Carboidratos</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-right">
                                    <div className="text-sm font-bold text-[#5f6f52]">{carbs.toFixed(1)}g</div>
                                    <div className="text-xs text-muted-foreground">{carbsPerc.toFixed(1)}%</div>
                                </div>
                                {carbsStatus && getStatusIcon(carbsStatus)}
                            </div>
                        </div>
                        {carbsStatus && carbsStatus.status !== 'ok' && (
                            <div className="text-xs text-yellow-700 pl-5">
                                {carbsStatus.message}
                            </div>
                        )}

                        {/* Gorduras */}
                        <div className="flex items-center justify-between p-2 bg-[#b99470]/10 rounded border border-[#b99470]/20">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.fat }} />
                                <span className="text-sm font-medium">Gorduras</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-right">
                                    <div className="text-sm font-bold text-[#b99470]">{fat.toFixed(1)}g</div>
                                    <div className="text-xs text-muted-foreground">{fatPerc.toFixed(1)}%</div>
                                </div>
                                {fatStatus && getStatusIcon(fatStatus)}
                            </div>
                        </div>
                        {fatStatus && fatStatus.status !== 'ok' && (
                            <div className="text-xs text-yellow-700 pl-5">
                                {fatStatus.message}
                            </div>
                        )}
                    </div>

                    {/* Resumo de Status */}
                    {referenceValues && (proteinStatus || carbsStatus || fatStatus) && (
                        <div className="pt-3 border-t">
                            {[proteinStatus, carbsStatus, fatStatus].every(s => s?.status === 'ok') ? (
                                <Badge className="w-full bg-green-100 text-green-800 border-green-300 justify-center">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Todos os macros dentro do ideal
                                </Badge>
                            ) : (
                                <Badge className="w-full bg-yellow-100 text-yellow-800 border-yellow-300 justify-center">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Ajustes recomendados
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Nota informativa */}
                    {!referenceValues && (
                        <div className="text-xs text-muted-foreground bg-[#fefae0] p-2 rounded border border-[#a9b388]/30">
                            💡 Configure os valores de referência para ver alertas personalizados
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modal de Valores de Referência */}
            <ReferenceValuesModal
                isOpen={showReferenceModal}
                onClose={() => setShowReferenceModal(false)}
                patientId={patientId}
                initialValues={referenceValues}
                onSave={onReferenceUpdate}
            />
        </>
    );
};

export default MacrosChart;
