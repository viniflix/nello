import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import ReferenceValuesModal from '@/components/meal-plan/ReferenceValuesModal';
import { getMealPlanById, getReferenceValues, deleteReferenceValues } from '@/lib/supabase/meal-plan-queries';
import { useToast } from '@/components/ui/use-toast';

const MEAL_COLORS = [
    '#8884d8', // Roxo
    '#82ca9d', // Verde
    '#ffc658', // Amarelo
    '#ff8042', // Laranja
    '#0088fe', // Azul
    '#00c49f', // Verde claro
    '#ffbb28', // Amarelo escuro
    '#ff6b6b', // Vermelho
    '#a57ed0'  // Lilás
];

const MealPlanSummaryPage = () => {
    const { patientId, planId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [plan, setPlan] = useState(null);
    const [referenceValues, setReferenceValues] = useState(null);
    const [showRefModal, setShowRefModal] = useState(false);

    useEffect(() => {
        loadData();
    }, [planId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [planResult, refResult] = await Promise.all([
                getMealPlanById(planId),
                getReferenceValues(planId)
            ]);

            if (planResult.error) throw planResult.error;

            setPlan(planResult.data);
            setReferenceValues(refResult.data);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar o resumo nutricional',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRefModalClose = () => {
        setShowRefModal(false);
        // Recarregar valores de referência
        loadData();
    };

    const handleDeleteReferenceValues = async () => {
        if (!window.confirm('Tem certeza que deseja excluir os valores de referência? Esta ação não pode ser desfeita.')) {
            return;
        }

        setLoading(true);
        try {
            const result = await deleteReferenceValues(planId);

            if (result.error) throw result.error;

            toast({
                title: 'Valores deletados',
                description: 'Valores de referência foram excluídos com sucesso.',
            });

            // Recarregar dados para atualizar a UI
            loadData();
        } catch (error) {
            console.error('Erro ao deletar valores:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível excluir os valores de referência.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    // Preparar dados para o gráfico de pizza
    const prepareChartData = () => {
        if (!plan || !plan.meals) return [];

        return plan.meals.map(meal => ({
            name: meal.name,
            value: meal.total_calories || 0
        })).filter(item => item.value > 0);
    };

    // Calcular metas de referência em gramas
    const calculateTargets = () => {
        if (!referenceValues) return null;

        const weight = parseFloat(referenceValues.weight_kg);
        const energy = parseFloat(referenceValues.total_energy_kcal);

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
            protein: proteinG,
            carbs: carbsG,
            fat: fatG
        };
    };

    // Calcular adequação (verde/amarelo/vermelho)
    const getAdequacyStatus = (value, target) => {
        const percentage = (value / target) * 100;

        if (percentage >= 95 && percentage <= 105) return 'adequate'; // Verde
        if (percentage >= 85 && percentage <= 115) return 'adjust'; // Amarelo
        return 'inadequate'; // Vermelho
    };

    const getAdequacyColor = (status) => {
        switch (status) {
            case 'adequate': return 'text-green-600 bg-green-50';
            case 'adjust': return 'text-yellow-600 bg-yellow-50';
            case 'inadequate': return 'text-red-600 bg-red-50';
            default: return '';
        }
    };

    const chartData = prepareChartData();
    const targets = calculateTargets();

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <p>Carregando...</p>
            </div>
        );
    }

    if (!plan) {
        return (
            <div className="p-8">
                <Alert variant="destructive">
                    <AlertDescription>Plano não encontrado</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan`)}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">Resumo Nutricional</h1>
                        <p className="text-muted-foreground">{plan.name}</p>
                    </div>
                </div>
                <Button onClick={() => setShowRefModal(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    Configurar Valores de Referência
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico de Distribuição de Calorias */}
                <Card>
                    <CardHeader>
                        <CardTitle>Distribuição de Calorias por Refeição</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) =>
                                            `${name}: ${(percent * 100).toFixed(0)}%`
                                        }
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={MEAL_COLORS[index % MEAL_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `${value} kcal`} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                                Nenhuma refeição com calorias registradas
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Totais Diários */}
                <Card>
                    <CardHeader>
                        <CardTitle>Totais Diários</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 border rounded-lg">
                                <div className="text-sm text-muted-foreground">Energia</div>
                                <div className="text-3xl font-bold">{plan.daily_calories?.toFixed(0) || 0}</div>
                                <div className="text-xs text-muted-foreground">kcal</div>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <div className="text-sm text-muted-foreground">Proteínas</div>
                                <div className="text-3xl font-bold">{plan.daily_protein?.toFixed(1) || 0}</div>
                                <div className="text-xs text-muted-foreground">g</div>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <div className="text-sm text-muted-foreground">Carboidratos</div>
                                <div className="text-3xl font-bold">{plan.daily_carbs?.toFixed(1) || 0}</div>
                                <div className="text-xs text-muted-foreground">g</div>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <div className="text-sm text-muted-foreground">Gorduras</div>
                                <div className="text-3xl font-bold">{plan.daily_fat?.toFixed(1) || 0}</div>
                                <div className="text-xs text-muted-foreground">g</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Comparação com Valores de Referência */}
            {referenceValues && targets && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>Comparação com Valores de Referência</CardTitle>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDeleteReferenceValues}
                                disabled={loading}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir Valores
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Macronutriente</TableHead>
                                    <TableHead className="text-right">Prescrito</TableHead>
                                    <TableHead className="text-right">Meta</TableHead>
                                    <TableHead className="text-right">Adequação (%)</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* Energia */}
                                <TableRow>
                                    <TableCell className="font-medium">Energia (kcal)</TableCell>
                                    <TableCell className="text-right">{plan.daily_calories?.toFixed(0) || 0}</TableCell>
                                    <TableCell className="text-right">{referenceValues.total_energy_kcal}</TableCell>
                                    <TableCell className="text-right">
                                        {((plan.daily_calories / referenceValues.total_energy_kcal) * 100).toFixed(1)}%
                                    </TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                            getAdequacyColor(getAdequacyStatus(plan.daily_calories, referenceValues.total_energy_kcal))
                                        }`}>
                                            {getAdequacyStatus(plan.daily_calories, referenceValues.total_energy_kcal) === 'adequate' ? 'Adequado' :
                                             getAdequacyStatus(plan.daily_calories, referenceValues.total_energy_kcal) === 'adjust' ? 'Ajustar' : 'Inadequado'}
                                        </span>
                                    </TableCell>
                                </TableRow>

                                {/* Proteínas */}
                                <TableRow>
                                    <TableCell className="font-medium">Proteínas (g)</TableCell>
                                    <TableCell className="text-right">{plan.daily_protein?.toFixed(1) || 0}</TableCell>
                                    <TableCell className="text-right">{targets.protein.toFixed(1)}</TableCell>
                                    <TableCell className="text-right">
                                        {((plan.daily_protein / targets.protein) * 100).toFixed(1)}%
                                    </TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                            getAdequacyColor(getAdequacyStatus(plan.daily_protein, targets.protein))
                                        }`}>
                                            {getAdequacyStatus(plan.daily_protein, targets.protein) === 'adequate' ? 'Adequado' :
                                             getAdequacyStatus(plan.daily_protein, targets.protein) === 'adjust' ? 'Ajustar' : 'Inadequado'}
                                        </span>
                                    </TableCell>
                                </TableRow>

                                {/* Carboidratos */}
                                <TableRow>
                                    <TableCell className="font-medium">Carboidratos (g)</TableCell>
                                    <TableCell className="text-right">{plan.daily_carbs?.toFixed(1) || 0}</TableCell>
                                    <TableCell className="text-right">{targets.carbs.toFixed(1)}</TableCell>
                                    <TableCell className="text-right">
                                        {((plan.daily_carbs / targets.carbs) * 100).toFixed(1)}%
                                    </TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                            getAdequacyColor(getAdequacyStatus(plan.daily_carbs, targets.carbs))
                                        }`}>
                                            {getAdequacyStatus(plan.daily_carbs, targets.carbs) === 'adequate' ? 'Adequado' :
                                             getAdequacyStatus(plan.daily_carbs, targets.carbs) === 'adjust' ? 'Ajustar' : 'Inadequado'}
                                        </span>
                                    </TableCell>
                                </TableRow>

                                {/* Gorduras */}
                                <TableRow>
                                    <TableCell className="font-medium">Gorduras (g)</TableCell>
                                    <TableCell className="text-right">{plan.daily_fat?.toFixed(1) || 0}</TableCell>
                                    <TableCell className="text-right">{targets.fat.toFixed(1)}</TableCell>
                                    <TableCell className="text-right">
                                        {((plan.daily_fat / targets.fat) * 100).toFixed(1)}%
                                    </TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                            getAdequacyColor(getAdequacyStatus(plan.daily_fat, targets.fat))
                                        }`}>
                                            {getAdequacyStatus(plan.daily_fat, targets.fat) === 'adequate' ? 'Adequado' :
                                             getAdequacyStatus(plan.daily_fat, targets.fat) === 'adjust' ? 'Ajustar' : 'Inadequado'}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Tabela de Refeições */}
            <Card>
                <CardHeader>
                    <CardTitle>Distribuição por Refeição</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Refeição</TableHead>
                                <TableHead>Horário</TableHead>
                                <TableHead className="text-right">Calorias</TableHead>
                                <TableHead className="text-right">Proteínas (g)</TableHead>
                                <TableHead className="text-right">Carboidratos (g)</TableHead>
                                <TableHead className="text-right">Gorduras (g)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {plan.meals && plan.meals.map((meal) => (
                                <TableRow key={meal.id}>
                                    <TableCell className="font-medium">{meal.name}</TableCell>
                                    <TableCell>{meal.meal_time || '-'}</TableCell>
                                    <TableCell className="text-right">{meal.total_calories?.toFixed(0) || 0}</TableCell>
                                    <TableCell className="text-right">{meal.total_protein?.toFixed(1) || 0}</TableCell>
                                    <TableCell className="text-right">{meal.total_carbs?.toFixed(1) || 0}</TableCell>
                                    <TableCell className="text-right">{meal.total_fat?.toFixed(1) || 0}</TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="font-bold bg-muted/50">
                                <TableCell colSpan={2}>TOTAL</TableCell>
                                <TableCell className="text-right">{plan.daily_calories?.toFixed(0) || 0}</TableCell>
                                <TableCell className="text-right">{plan.daily_protein?.toFixed(1) || 0}</TableCell>
                                <TableCell className="text-right">{plan.daily_carbs?.toFixed(1) || 0}</TableCell>
                                <TableCell className="text-right">{plan.daily_fat?.toFixed(1) || 0}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Aviso se não tiver valores de referência */}
            {!referenceValues && (
                <Alert>
                    <AlertDescription>
                        Configure os valores de referência para ver a análise de adequação nutricional.
                        <Button
                            variant="link"
                            className="px-2"
                            onClick={() => setShowRefModal(true)}
                        >
                            Configurar agora
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* Modal de Valores de Referência */}
            <ReferenceValuesModal
                isOpen={showRefModal}
                onClose={handleRefModalClose}
                planId={planId}
            />
        </div>
    );
};

export default MealPlanSummaryPage;
