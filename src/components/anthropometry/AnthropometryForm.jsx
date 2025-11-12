import React, { useState, useEffect } from 'react';
import { Save, X, Calculator } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getLatestAnthropometryRecord } from '@/lib/supabase/anthropometry-queries';

const AnthropometryForm = ({
    patientId,
    initialData = null,
    onSubmit,
    onCancel,
    loading = false
}) => {
    const [formData, setFormData] = useState({
        weight: '',
        height: '',
        record_date: new Date().toISOString().split('T')[0],
        notes: ''
    });

    const [lastRecord, setLastRecord] = useState(null);
    const [calculatedBMI, setCalculatedBMI] = useState(null);
    const [errors, setErrors] = useState({});

    // Buscar último registro para usar como placeholder
    useEffect(() => {
        const fetchLastRecord = async () => {
            if (!initialData && patientId) {
                const { data } = await getLatestAnthropometryRecord(patientId);
                if (data) {
                    setLastRecord(data);
                }
            }
        };
        fetchLastRecord();
    }, [patientId, initialData]);

    // Preencher formulário se estiver editando
    useEffect(() => {
        if (initialData) {
            setFormData({
                weight: initialData.weight || '',
                height: initialData.height || '',
                record_date: initialData.record_date || new Date().toISOString().split('T')[0],
                notes: initialData.notes || ''
            });
        }
    }, [initialData]);

    // Calcular IMC automaticamente
    useEffect(() => {
        const { weight, height } = formData;
        if (weight && height) {
            const bmi = parseFloat(weight) / Math.pow(parseFloat(height) / 100, 2);
            setCalculatedBMI(bmi);
        } else {
            setCalculatedBMI(null);
        }
    }, [formData.weight, formData.height]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Limpar erro do campo ao digitar
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    const validate = () => {
        const newErrors = {};

        if (!formData.weight || parseFloat(formData.weight) <= 0) {
            newErrors.weight = 'Peso é obrigatório e deve ser maior que zero';
        }

        if (!formData.height || parseFloat(formData.height) <= 0) {
            newErrors.height = 'Altura é obrigatória e deve ser maior que zero';
        }

        if (!formData.record_date) {
            newErrors.record_date = 'Data é obrigatória';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!validate()) {
            return;
        }

        const submitData = {
            patient_id: patientId,
            weight: parseFloat(formData.weight),
            height: parseFloat(formData.height),
            record_date: formData.record_date,
            notes: formData.notes.trim() || null
        };

        onSubmit(submitData, initialData?.id);
    };

    const handleReset = () => {
        setFormData({
            weight: '',
            height: '',
            record_date: new Date().toISOString().split('T')[0],
            notes: ''
        });
        setErrors({});
        setCalculatedBMI(null);
        if (onCancel) onCancel();
    };

    const getIMCCategory = (bmi) => {
        if (!bmi) return null;
        if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-600' };
        if (bmi < 25) return { label: 'Peso normal', color: 'text-green-600' };
        if (bmi < 30) return { label: 'Sobrepeso', color: 'text-yellow-600' };
        return { label: 'Obesidade', color: 'text-red-600' };
    };

    const imcCategory = getIMCCategory(calculatedBMI);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">
                    {initialData ? 'Editar Registro' : 'Novo Registro Antropométrico'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Peso */}
                        <div className="space-y-2">
                            <Label htmlFor="weight">
                                Peso (kg) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="weight"
                                name="weight"
                                type="number"
                                step="0.1"
                                min="0"
                                placeholder={lastRecord?.weight ? `Último: ${lastRecord.weight} kg` : "Ex: 70.5"}
                                value={formData.weight}
                                onChange={handleChange}
                                className={errors.weight ? 'border-destructive' : ''}
                                disabled={loading}
                            />
                            {errors.weight && (
                                <p className="text-xs text-destructive">{errors.weight}</p>
                            )}
                        </div>

                        {/* Altura */}
                        <div className="space-y-2">
                            <Label htmlFor="height">
                                Altura (cm) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="height"
                                name="height"
                                type="number"
                                step="0.1"
                                min="0"
                                placeholder={lastRecord?.height ? `Último: ${lastRecord.height} cm` : "Ex: 170"}
                                value={formData.height}
                                onChange={handleChange}
                                className={errors.height ? 'border-destructive' : ''}
                                disabled={loading}
                            />
                            {errors.height && (
                                <p className="text-xs text-destructive">{errors.height}</p>
                            )}
                        </div>

                        {/* Data */}
                        <div className="space-y-2">
                            <Label htmlFor="record_date">
                                Data <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="record_date"
                                name="record_date"
                                type="date"
                                value={formData.record_date}
                                onChange={handleChange}
                                className={errors.record_date ? 'border-destructive' : ''}
                                disabled={loading}
                            />
                            {errors.record_date && (
                                <p className="text-xs text-destructive">{errors.record_date}</p>
                            )}
                        </div>
                    </div>

                    {/* IMC Calculado */}
                    {calculatedBMI && (
                        <Alert className="bg-muted/50">
                            <Calculator className="h-4 w-4" />
                            <AlertDescription>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">IMC Calculado:</span>
                                    <span className="text-lg font-bold">{calculatedBMI.toFixed(1)}</span>
                                    {imcCategory && (
                                        <span className={`text-sm font-medium ${imcCategory.color}`}>
                                            ({imcCategory.label})
                                        </span>
                                    )}
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Observações */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">Observações (opcional)</Label>
                        <Textarea
                            id="notes"
                            name="notes"
                            rows={3}
                            placeholder="Adicione observações sobre o registro (ex: mudança de dieta, início de exercícios, etc.)"
                            value={formData.notes}
                            onChange={handleChange}
                            disabled={loading}
                        />
                    </div>

                    {/* Botões */}
                    <div className="flex gap-2 justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleReset}
                            disabled={loading}
                        >
                            <X className="w-4 h-4 mr-2" />
                            {initialData ? 'Cancelar' : 'Limpar'}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? 'Salvando...' : initialData ? 'Atualizar' : 'Salvar'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default AnthropometryForm;
