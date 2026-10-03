import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect } from 'react';
import { Save, X, RotateCcw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { saveReferenceValues, getReferenceValues } from '@/lib/supabase/meal-plan-queries';

const ReferenceValuesModal = ({ isOpen, onClose, planId }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [initialValues, setInitialValues] = useState(null);

    const [formData, setFormData] = useState({
        weight_kg: '',
        weight_type: 'current',
        total_energy_kcal: '',
        macro_mode: 'percentage',
        // Percentuais em formato 0-100 (mais intuitivo)
        protein_pct: 33.3,
        carbs_pct: 33.3,
        fat_pct: 33.3,
        // g/kg
        protein_g_per_kg: '',
        carbs_g_per_kg: '',
        fat_g_per_kg: ''
    });

    const [errors, setErrors] = useState({});

    // Carregar valores existentes ao abrir
    useEffect(() => {
        if (isOpen && planId) {
            loadExistingValues();
        }
    }, [isOpen, planId]);

    const loadExistingValues = async () => {
        setLoading(true);
        try {
            const { data } = await getReferenceValues(planId);

            if (data) {
                setFormData({
                    weight_kg: data.weight_kg || '',
                    weight_type: data.weight_type || 'current',
                    total_energy_kcal: data.total_energy_kcal || '',
                    macro_mode: data.macro_mode || 'percentage',
                    // Converter de decimal (0.20) para percentual (20)
                    protein_pct: data.protein_percentage != null ? data.protein_percentage * 100 : 33.3,
                    carbs_pct: data.carbs_percentage != null ? data.carbs_percentage * 100 : 33.3,
                    fat_pct: data.fat_percentage != null ? data.fat_percentage * 100 : 33.3,
                    protein_g_per_kg: data.protein_g_per_kg ?? '',
                    carbs_g_per_kg: data.carbs_g_per_kg ?? '',
                    fat_g_per_kg: data.fat_g_per_kg ?? ''
                });
                setInitialValues(data);
            }
        } catch (error) {
            logDiagnostic('error', 'components/meal-plan/ReferenceValuesModal.jsx:77', 'Erro ao carregar valores:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    // Each target belongs to the professional; editing one never rewrites another.
    const handleCarbsChange = ([value]) => handleChange('carbs_pct', value);
    const handleProteinChange = ([value]) => handleChange('protein_pct', value);
    const handleFatChange = ([value]) => handleChange('fat_pct', value);

    const calculateTargets = () => {
        const weight = parseFloat(formData.weight_kg);
        const energy = parseFloat(formData.total_energy_kcal);

        if (!weight || !energy) return null;

        let proteinG, carbsG, fatG;

        if (formData.macro_mode === 'percentage') {
            // Converter percentual (0-100) para decimal (0-1)
            const proteinPct = formData.protein_pct / 100;
            const carbsPct = formData.carbs_pct / 100;
            const fatPct = formData.fat_pct / 100;

            // Calorias por macronutriente: Proteína = 4kcal/g, Carbs = 4kcal/g, Gordura = 9kcal/g
            proteinG = (energy * proteinPct) / 4;
            carbsG = (energy * carbsPct) / 4;
            fatG = (energy * fatPct) / 9;
        } else {
            // modo g_per_kg
            proteinG = weight * (parseFloat(formData.protein_g_per_kg) || 0);
            carbsG = weight * (parseFloat(formData.carbs_g_per_kg) || 0);
            fatG = weight * (parseFloat(formData.fat_g_per_kg) || 0);
        }

        return {
            protein: proteinG.toFixed(0),
            carbs: carbsG.toFixed(0),
            fat: fatG.toFixed(0),
            proteinCal: (proteinG * 4).toFixed(0),
            carbsCal: (carbsG * 4).toFixed(0),
            fatCal: (fatG * 9).toFixed(0),
            totalCal: ((proteinG * 4) + (carbsG * 4) + (fatG * 9)).toFixed(0)
        };
    };

    const validate = () => {
        const newErrors = {};

        if (!formData.weight_kg || parseFloat(formData.weight_kg) <= 0) {
            newErrors.weight_kg = 'Peso é obrigatório e deve ser maior que zero';
        }

        if (!formData.total_energy_kcal || parseFloat(formData.total_energy_kcal) <= 0) {
            newErrors.total_energy_kcal = 'Energia é obrigatória e deve ser maior que zero';
        }

        if (formData.macro_mode === 'percentage') {
            const total = formData.protein_pct + formData.carbs_pct + formData.fat_pct;
            // Tolerância de 0.5% para arredondamento
            if (Math.abs(total - 100) > 0.5) {
                newErrors.macro_sum = `Soma dos percentuais deve ser 100% (atual: ${total.toFixed(1)}%)`;
            }
        } else {
            for (const field of ['protein_g_per_kg','carbs_g_per_kg','fat_g_per_kg']) {
                if (formData[field] === '' || !Number.isFinite(Number(formData[field])) || Number(formData[field]) < 0) newErrors[field] = 'Informe um valor maior ou igual a zero';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;

        setLoading(true);
        try {
            // Converter percentuais de volta para decimal antes de salvar
            const dataToSave = {
                weight_kg: parseFloat(formData.weight_kg),
                weight_type: formData.weight_type,
                total_energy_kcal: parseFloat(formData.total_energy_kcal),
                macro_mode: formData.macro_mode,
                protein_percentage: formData.macro_mode === 'percentage' ? formData.protein_pct / 100 : null,
                carbs_percentage: formData.macro_mode === 'percentage' ? formData.carbs_pct / 100 : null,
                fat_percentage: formData.macro_mode === 'percentage' ? formData.fat_pct / 100 : null,
                protein_g_per_kg: formData.macro_mode === 'g_per_kg' ? parseFloat(formData.protein_g_per_kg) : null,
                carbs_g_per_kg: formData.macro_mode === 'g_per_kg' ? parseFloat(formData.carbs_g_per_kg) : null,
                fat_g_per_kg: formData.macro_mode === 'g_per_kg' ? parseFloat(formData.fat_g_per_kg) : null
            };

            const result = await saveReferenceValues(planId, dataToSave);

            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: 'Valores de referência salvos com sucesso',
                variant: 'success'
            });

            setInitialValues(result.data);
            onClose();
        } catch (error) {
            logDiagnostic('error', 'components/meal-plan/ReferenceValuesModal.jsx:269', 'Erro ao salvar:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível salvar os valores',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        // Apenas limpar o formulário
        setFormData({
            weight_kg: '',
            weight_type: 'current',
            total_energy_kcal: '',
            macro_mode: 'percentage',
            protein_pct: 33.3,
            carbs_pct: 33.3,
            fat_pct: 33.3,
            protein_g_per_kg: '',
            carbs_g_per_kg: '',
            fat_g_per_kg: ''
        });
        setErrors({});
    };

    const handleClose = () => {
        setErrors({});
        onClose();
    };

    const targets = calculateTargets();
    const totalPct = formData.protein_pct + formData.carbs_pct + formData.fat_pct;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <DialogTitle>Valores de Referência Nutricional</DialogTitle>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <Info className="h-4 w-4 text-blue-600" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-96">
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-sm">Como funcionam os cálculos:</h4>
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                        <div>
                                            <strong className="text-foreground">Percentuais:</strong> Distribuição da energia total.
                                            <br />
                                            Ex: 20% de proteínas em 2000kcal = 400kcal ÷ 4kcal/g = 100g
                                        </div>
                                        <div>
                                            <strong className="text-foreground">Gramas/Kg:</strong> Quantidade por peso corporal.
                                            <br />
                                            Ex: 2g/kg × 70kg = 140g de proteínas
                                        </div>
                                        <div>
                                            <strong className="text-foreground">Valores calóricos:</strong>
                                            <br />
                                            Proteínas e Carboidratos = 4kcal/g
                                            <br />
                                            Gorduras = 9kcal/g
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <DialogDescription>
                        Configure os valores de referência para análise e comparação do plano alimentar
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">

                    {/* Dados do Paciente */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Dados do Paciente</CardTitle>
                            <CardDescription>Informações básicas para o cálculo</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="weight">
                                        Peso (kg) <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="weight"
                                        type="number"
                                        step="0.1"
                                        placeholder="Ex: 70.5"
                                        value={formData.weight_kg}
                                        onChange={(e) => handleChange('weight_kg', e.target.value)}
                                        className={errors.weight_kg ? 'border-destructive' : ''}
                                    />
                                    {errors.weight_kg && (
                                        <p className="text-xs text-destructive">{errors.weight_kg}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Tipo de Peso</Label>
                                    <RadioGroup
                                        value={formData.weight_type}
                                        onValueChange={(value) => handleChange('weight_type', value)}
                                        className="flex gap-4"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="current" id="current" />
                                            <Label htmlFor="current" className="font-normal cursor-pointer">
                                                Peso Atual
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="desired" id="desired" />
                                            <Label htmlFor="desired" className="font-normal cursor-pointer">
                                                Peso Desejado
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="energy">
                                    Energia Total Diária (kcal) <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="energy"
                                    type="number"
                                    placeholder="Ex: 2000"
                                    value={formData.total_energy_kcal}
                                    onChange={(e) => handleChange('total_energy_kcal', e.target.value)}
                                    className={errors.total_energy_kcal ? 'border-destructive' : ''}
                                />
                                {errors.total_energy_kcal && (
                                    <p className="text-xs text-destructive">{errors.total_energy_kcal}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Gasto energético total estimado (TEE) do paciente
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Macronutrientes */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Distribuição de Macronutrientes</CardTitle>
                            <CardDescription>Escolha como deseja configurar os macronutrientes</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Modo de Adequação */}
                            <div className="space-y-3">
                                <Label>Modo de Configuração</Label>
                                <RadioGroup
                                    value={formData.macro_mode}
                                    onValueChange={(value) => handleChange('macro_mode', value)}
                                    className="flex flex-col gap-3"
                                >
                                    <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                                        <RadioGroupItem value="percentage" id="percentage" className="mt-1" />
                                        <div className="flex-1">
                                            <Label htmlFor="percentage" className="font-semibold cursor-pointer">
                                                Percentuais da Energia Total
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Distribua a energia em porcentagens (recomendado para maioria dos casos)
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                                        <RadioGroupItem value="g_per_kg" id="g_per_kg" className="mt-1" />
                                        <div className="flex-1">
                                            <Label htmlFor="g_per_kg" className="font-semibold cursor-pointer">
                                                Gramas por Kg de Peso
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Configure baseado no peso corporal (ideal para atletas e hipertrofia)
                                            </p>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>

                            {/* Modo Percentuais com Sliders */}
                            {formData.macro_mode === 'percentage' && (
                                <div className="space-y-6 pt-4">
                                    {/* Proteínas */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <Label className="flex-1">Proteínas</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min="5"
                                                    max="50"
                                                    step="0.1"
                                                    aria-label="Proteínas (%)"
                                                    value={formData.protein_pct}
                                                    onChange={(e) => {
                                                        const value = parseFloat(e.target.value) || 0;
                                                        handleProteinChange([Math.max(5, Math.min(50, value))]);
                                                    }}
                                                    className="w-20 text-center"
                                                />
                                                <span className="text-sm font-medium text-blue-600">%</span>
                                            </div>
                                        </div>
                                        <Slider
                                            value={[formData.protein_pct]}
                                            onValueChange={handleProteinChange}
                                            min={5}
                                            max={50}
                                            step={0.1}
                                            className="w-full"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Arraste ou digite o valor. As outras metas permanecem como você definiu.
                                        </p>
                                    </div>

                                    {/* Carboidratos */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <Label className="flex-1">Carboidratos</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min="5"
                                                    max="75"
                                                    step="0.1"
                                                    aria-label="Carboidratos (%)"
                                                    value={formData.carbs_pct}
                                                    onChange={(e) => {
                                                        const value = parseFloat(e.target.value) || 0;
                                                        handleCarbsChange([Math.max(5, Math.min(75, value))]);
                                                    }}
                                                    className="w-20 text-center"
                                                />
                                                <span className="text-sm font-medium text-green-600">%</span>
                                            </div>
                                        </div>
                                        <Slider
                                            value={[formData.carbs_pct]}
                                            onValueChange={handleCarbsChange}
                                            min={5}
                                            max={75}
                                            step={0.1}
                                            className="w-full"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Arraste ou digite o valor. As outras metas permanecem como você definiu.
                                        </p>
                                    </div>

                                    {/* Gorduras */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <Label className="flex-1">Gorduras</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min="5"
                                                    max="50"
                                                    step="0.1"
                                                    aria-label="Gorduras (%)"
                                                    value={formData.fat_pct}
                                                    onChange={(e) => {
                                                        const value = parseFloat(e.target.value) || 0;
                                                        handleFatChange([Math.max(5, Math.min(50, value))]);
                                                    }}
                                                    className="w-20 text-center"
                                                />
                                                <span className="text-sm font-medium text-orange-600">%</span>
                                            </div>
                                        </div>
                                        <Slider
                                            value={[formData.fat_pct]}
                                            onValueChange={handleFatChange}
                                            min={5}
                                            max={50}
                                            step={0.1}
                                            className="w-full"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Arraste ou digite o valor. As outras metas permanecem como você definiu.
                                        </p>
                                    </div>

                                    {/* Indicador de Total */}
                                    <div className={`p-3 rounded-lg ${
                                        Math.abs(totalPct - 100) <= 0.5
                                            ? 'bg-green-50 border border-green-200'
                                            : 'bg-yellow-50 border border-yellow-200'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Total:</span>
                                            <span className="text-lg font-bold">
                                                {totalPct.toFixed(1)}%
                                            </span>
                                        </div>
                                        {errors.macro_sum && (
                                            <p className="text-xs text-destructive mt-1">{errors.macro_sum}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Modo Gramas por Kg */}
                            {formData.macro_mode === 'g_per_kg' && (
                                <div className="grid grid-cols-3 gap-4 pt-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="protein_gkg">
                                            Proteínas (g/kg) <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="protein_gkg"
                                            type="number"
                                            step="0.1"
                                            placeholder="Ex: 2.0"
                                            value={formData.protein_g_per_kg}
                                            onChange={(e) => handleChange('protein_g_per_kg', e.target.value)}
                                            className={errors.protein_g_per_kg ? 'border-destructive' : ''}
                                        />
                                        {errors.protein_g_per_kg && (
                                            <p className="text-xs text-destructive">{errors.protein_g_per_kg}</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="carbs_gkg">
                                            Carboidratos (g/kg) <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="carbs_gkg"
                                            type="number"
                                            step="0.1"
                                            placeholder="Ex: 4.0"
                                            value={formData.carbs_g_per_kg}
                                            onChange={(e) => handleChange('carbs_g_per_kg', e.target.value)}
                                            className={errors.carbs_g_per_kg ? 'border-destructive' : ''}
                                        />
                                        {errors.carbs_g_per_kg && (
                                            <p className="text-xs text-destructive">{errors.carbs_g_per_kg}</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="fat_gkg">
                                            Gorduras (g/kg) <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="fat_gkg"
                                            type="number"
                                            step="0.1"
                                            placeholder="Ex: 1.0"
                                            value={formData.fat_g_per_kg}
                                            onChange={(e) => handleChange('fat_g_per_kg', e.target.value)}
                                            className={errors.fat_g_per_kg ? 'border-destructive' : ''}
                                        />
                                        {errors.fat_g_per_kg && (
                                            <p className="text-xs text-destructive">{errors.fat_g_per_kg}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Preview dos Valores Calculados */}
                    {targets && (
                        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                            <CardHeader>
                                <CardTitle className="text-base">Metas Calculadas</CardTitle>
                                <CardDescription>Valores alvo diários em gramas</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
                                    <div className="text-center p-3 sm:p-4 bg-white rounded-lg border">
                                        <div className="text-xs sm:text-sm text-muted-foreground mb-1">Proteínas</div>
                                        <div className="text-2xl sm:text-3xl font-bold text-blue-600 break-words">{targets.protein}g</div>
                                        <div className="text-xs sm:text-xs text-muted-foreground mt-1 break-words">
                                            {targets.proteinCal} kcal ({formData.macro_mode === 'percentage' ? `${formData.protein_pct.toFixed(1)}%` : `${formData.protein_g_per_kg}g/kg`})
                                        </div>
                                    </div>
                                    <div className="text-center p-3 sm:p-4 bg-white rounded-lg border">
                                        <div className="text-xs sm:text-sm text-muted-foreground mb-1">Carboidratos</div>
                                        <div className="text-2xl sm:text-3xl font-bold text-green-600 break-words">{targets.carbs}g</div>
                                        <div className="text-xs sm:text-xs text-muted-foreground mt-1 break-words">
                                            {targets.carbsCal} kcal ({formData.macro_mode === 'percentage' ? `${formData.carbs_pct.toFixed(1)}%` : `${formData.carbs_g_per_kg}g/kg`})
                                        </div>
                                    </div>
                                    <div className="text-center p-3 sm:p-4 bg-white rounded-lg border">
                                        <div className="text-xs sm:text-sm text-muted-foreground mb-1">Gorduras</div>
                                        <div className="text-2xl sm:text-3xl font-bold text-orange-600 break-words">{targets.fat}g</div>
                                        <div className="text-xs sm:text-xs text-muted-foreground mt-1 break-words">
                                            {targets.fatCal} kcal ({formData.macro_mode === 'percentage' ? `${formData.fat_pct.toFixed(1)}%` : `${formData.fat_g_per_kg}g/kg`})
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center text-xs sm:text-sm text-muted-foreground">
                                    Total energético calculado: <strong>{targets.totalCal} kcal</strong>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={handleClear}
                        disabled={loading}
                    >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Limpar
                    </Button>
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                        <Save className="h-4 w-4 mr-2" />
                        {loading ? 'Salvando...' : 'Salvar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ReferenceValuesModal;
