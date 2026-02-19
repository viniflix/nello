import React, { useState, useEffect } from 'react';
import { Save, X, Calculator, Ruler, Scissors, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLatestAnthropometryRecord } from '@/lib/supabase/anthropometry-queries';
import PhotoGallery from './PhotoGallery';
import { differenceInYears } from 'date-fns';
import {
  calculateFrameSize,
  calculateSomatotype,
  getSomatotypeDescription
} from '@/lib/utils/anthropometry-calculations';

const AnthropometryForm = ({
    patientId,
    initialData = null,
    onSubmit,
    onCancel,
    loading = false,
    patientGender = null,
    patientBirthDate = null
}) => {
    const [formData, setFormData] = useState({
        weight: '',
        height: '',
        record_date: new Date().toISOString().split('T')[0],
        notes: '',
        // Circunferências
        circumferences: {
            // Tronco
            ombro: '',
            peito: '',
            cintura: '',
            abdomen: '',
            quadril: '',
            // Membros (E/D)
            braco_relaxado_e: '',
            braco_relaxado_d: '',
            braco_contraido_e: '',
            braco_contraido_d: '',
            coxa_proximal_e: '',
            coxa_proximal_d: '',
            coxa_medial_e: '',
            coxa_medial_d: '',
            panturrilha_e: '',
            panturrilha_d: ''
        },
        // Dobras cutâneas (com campos adicionais para protocolos)
        skinfolds: {
            triceps: '',
            biceps: '',
            subescapular: '',
            suprailiaca: '',
            abdominal: '',
            coxa: '',
            panturrilha: '',
            // Campos adicionais para Pollock 7 e Weltman
            peito: '',
            axilar: ''
        },
        // Diâmetros ósseos
        bone_diameters: {
            punho: '',      // Styloid process
            femur: '',      // Biepicondylar
            umero: ''       // Biepicondylar
        },
        // Bioimpedância
        bioimpedance: {
            percent_gordura: '',
            percent_massa_magra: '',
            gordura_visceral: ''
        },
        // Fotos
        photos: []
    });

    const [lastRecord, setLastRecord] = useState(null);
    const [calculatedBMI, setCalculatedBMI] = useState(null);
    const [idealWeightRange, setIdealWeightRange] = useState(null);
    const [calculatedRCQ, setCalculatedRCQ] = useState(null);
    const [estimatedBodyFat, setEstimatedBodyFat] = useState(null);
    const [errors, setErrors] = useState({});
    const [protocol, setProtocol] = useState('pollock7');
    const [compositionResults, setCompositionResults] = useState(null);
    const [frameSize, setFrameSize] = useState(null);
    const [somatotype, setSomatotype] = useState(null);

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
                notes: initialData.notes || '',
                circumferences: initialData.circumferences || formData.circumferences,
                skinfolds: initialData.skinfolds || formData.skinfolds,
                bone_diameters: initialData.bone_diameters || {
                punho: '',
                femur: '',
                umero: ''
            },
                bioimpedance: initialData.bioimpedance || formData.bioimpedance,
                photos: initialData.photos || []
            });
        }
    }, [initialData]);

    // Calcular IMC e Peso Ideal automaticamente
    useEffect(() => {
        const { weight, height } = formData;
        if (weight && height) {
            const heightM = parseFloat(height) / 100;
            const bmi = parseFloat(weight) / Math.pow(heightM, 2);
            setCalculatedBMI(bmi);

            // Calcular faixa de peso ideal (BMI 18.5-24.9)
            const minIdealWeight = 18.5 * Math.pow(heightM, 2);
            const maxIdealWeight = 24.9 * Math.pow(heightM, 2);
            setIdealWeightRange({
                min: minIdealWeight,
                max: maxIdealWeight,
                current: parseFloat(weight)
            });
        } else {
            setCalculatedBMI(null);
            setIdealWeightRange(null);
        }
    }, [formData.weight, formData.height]);

    // Calcular RCQ (Relação Cintura-Quadril)
    useEffect(() => {
        const { cintura, quadril } = formData.circumferences;
        if (cintura && quadril) {
            const rcq = parseFloat(cintura) / parseFloat(quadril);
            setCalculatedRCQ(rcq);
        } else {
            setCalculatedRCQ(null);
        }
    }, [formData.circumferences.cintura, formData.circumferences.quadril]);

    // Calcular Composição Corporal usando protocolos científicos
    useEffect(() => {
        const weight = parseFloat(formData.weight);
        const height = parseFloat(formData.height);
        const age = patientBirthDate ? differenceInYears(new Date(), new Date(patientBirthDate)) : null;
        const gender = patientGender?.toLowerCase() || '';
        const isMale = gender.includes('m') || gender === 'masculino' || gender === 'male';

        if (!weight || !height) {
            setCompositionResults(null);
            setEstimatedBodyFat(null);
            return;
        }

        let bodyDensity = null;
        let bodyFatPercent = null;
        let fatMass = null;
        let leanMass = null;

        // Calcular baseado no protocolo selecionado
        if (protocol === 'bioimpedance' && formData.bioimpedance?.percent_gordura) {
            // Usar bioimpedância diretamente
            bodyFatPercent = parseFloat(formData.bioimpedance.percent_gordura);
        } else if (protocol === 'pollock3') {
            // Pollock 3 dobras: Tríceps, Subescapular, Suprailíaca
            const triceps = parseFloat(formData.skinfolds.triceps);
            const subscapular = parseFloat(formData.skinfolds.subescapular);
            const suprailiac = parseFloat(formData.skinfolds.suprailiaca);

            if (triceps && subscapular && suprailiac && age) {
                const sum = triceps + subscapular + suprailiac;
                const logSum = Math.log10(sum);

                // Jackson & Pollock (1985) - 3 dobras
                if (isMale) {
                    bodyDensity = 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum) - (0.0002574 * age);
                } else {
                    bodyDensity = 1.0994921 - (0.0009929 * sum) + (0.0000023 * sum * sum) - (0.0001392 * age);
                }
            }
        } else if (protocol === 'pollock7') {
            // Pollock 7 dobras: Peito, Axilar, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa
            const chest = parseFloat(formData.skinfolds.peito);
            const axillary = parseFloat(formData.skinfolds.axilar);
            const triceps = parseFloat(formData.skinfolds.triceps);
            const subscapular = parseFloat(formData.skinfolds.subescapular);
            const abdominal = parseFloat(formData.skinfolds.abdominal);
            const suprailiac = parseFloat(formData.skinfolds.suprailiaca);
            const thigh = parseFloat(formData.skinfolds.coxa);

            if (chest && axillary && triceps && subscapular && abdominal && suprailiac && thigh && age) {
                const sum = chest + axillary + triceps + subscapular + abdominal + suprailiac + thigh;

                // Jackson & Pollock (1985) - 7 dobras
                if (isMale) {
                    bodyDensity = 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum) - (0.00028826 * age);
                } else {
                    bodyDensity = 1.097 - (0.00046971 * sum) + (0.00000056 * sum * sum) - (0.00012828 * age);
                }
            }
        } else if (protocol === 'weltman') {
            // Weltman (1988) - 4 dobras: Tríceps, Bíceps, Subescapular, Suprailíaca
            const triceps = parseFloat(formData.skinfolds.triceps);
            const biceps = parseFloat(formData.skinfolds.biceps);
            const subscapular = parseFloat(formData.skinfolds.subescapular);
            const suprailiac = parseFloat(formData.skinfolds.suprailiaca);

            if (triceps && biceps && subscapular && suprailiac && age) {
                const sum = triceps + biceps + subscapular + suprailiac;

                // Weltman et al. (1988)
                const logSum = Math.log10(sum);
                if (isMale) {
                    bodyDensity = 1.1714 - (0.0671 * logSum);
                } else {
                    bodyDensity = 1.1665 - (0.0706 * logSum);
                }
            }
        }

        // Converter densidade corporal para % de gordura (Siri equation)
        if (bodyDensity && bodyDensity > 0) {
            bodyFatPercent = ((4.95 / bodyDensity) - 4.5) * 100;
        }

        // Calcular massa gorda e massa magra
        if (bodyFatPercent && bodyFatPercent > 0 && bodyFatPercent < 100) {
            fatMass = (weight * bodyFatPercent) / 100;
            leanMass = weight - fatMass;

            setCompositionResults({
                body_density: bodyDensity,
                body_fat_percent: bodyFatPercent,
                fat_mass_kg: fatMass,
                lean_mass_kg: leanMass,
                protocol: protocol
            });

            setEstimatedBodyFat(bodyFatPercent);
        } else {
            setCompositionResults(null);
            setEstimatedBodyFat(null);
        }
    }, [formData.weight, formData.height, formData.skinfolds, formData.bioimpedance, protocol, patientGender, patientBirthDate]);

    // Calcular Frame Size (Compleição Óssea)
    useEffect(() => {
        const height = parseFloat(formData.height);
        const wrist = parseFloat(formData.bone_diameters?.punho);
        const gender = patientGender?.toLowerCase() || '';
        const isMale = gender.includes('m') || gender === 'masculino' || gender === 'male';

        if (height && wrist) {
            const frame = calculateFrameSize(height, wrist, isMale);
            setFrameSize(frame);
        } else {
            setFrameSize(null);
        }
    }, [formData.height, formData.bone_diameters?.punho, patientGender]);

    // Calcular Somatotipo (Heath-Carter)
    useEffect(() => {
        const height = parseFloat(formData.height);
        const weight = parseFloat(formData.weight);
        const triceps = parseFloat(formData.skinfolds.triceps);
        const subscapular = parseFloat(formData.skinfolds.subescapular);
        const suprailiac = parseFloat(formData.skinfolds.suprailiaca);
        const humerusWidth = parseFloat(formData.bone_diameters?.umero);
        const femurWidth = parseFloat(formData.bone_diameters?.femur);
        const armCirc = formData.circumferences.braco_contraido_e || formData.circumferences.braco_contraido_d;
        const calfCirc = formData.circumferences.panturrilha_e || formData.circumferences.panturrilha_d;
        const gender = patientGender?.toLowerCase() || '';
        const isMale = gender.includes('m') || gender === 'masculino' || gender === 'male';

        if (height && weight) {
            const somatotypeResult = calculateSomatotype({
                height,
                weight,
                triceps,
                subscapular,
                suprailiac,
                humerusWidth,
                femurWidth,
                armCirc: parseFloat(armCirc),
                calfCirc: parseFloat(calfCirc),
                isMale
            });
            setSomatotype(somatotypeResult);
        } else {
            setSomatotype(null);
        }
    }, [
        formData.height,
        formData.weight,
        formData.skinfolds.triceps,
        formData.skinfolds.subescapular,
        formData.skinfolds.suprailiaca,
        formData.bone_diameters?.umero,
        formData.bone_diameters?.femur,
        formData.circumferences.braco_contraido_e,
        formData.circumferences.braco_contraido_d,
        formData.circumferences.panturrilha_e,
        formData.circumferences.panturrilha_d,
        patientGender
    ]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    const handleNestedChange = (section, field, value) => {
        setFormData(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }));
    };

    const handlePhotosChange = (newPhotos) => {
        setFormData(prev => ({ ...prev, photos: newPhotos }));
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

        // Limpar campos vazios dos objetos JSONB antes de enviar
        const cleanCircumferences = Object.fromEntries(
            Object.entries(formData.circumferences).filter(([_, v]) => v && v !== '')
        );
        const cleanSkinfolds = Object.fromEntries(
            Object.entries(formData.skinfolds).filter(([_, v]) => v && v !== '')
        );
        const cleanBioimpedance = Object.fromEntries(
            Object.entries(formData.bioimpedance).filter(([_, v]) => v && v !== '')
        );

        const submitData = {
            patient_id: patientId,
            weight: parseFloat(formData.weight),
            height: parseFloat(formData.height),
            record_date: formData.record_date,
            notes: formData.notes.trim() || null,
            circumferences: Object.keys(cleanCircumferences).length > 0 ? cleanCircumferences : null,
            skinfolds: Object.keys(cleanSkinfolds).length > 0 ? cleanSkinfolds : null,
            bone_diameters: Object.keys(formData.bone_diameters || {}).filter(k => formData.bone_diameters[k] && formData.bone_diameters[k] !== '').length > 0 
                ? Object.fromEntries(Object.entries(formData.bone_diameters).filter(([_, v]) => v && v !== ''))
                : null,
            bioimpedance: Object.keys(cleanBioimpedance).length > 0 ? cleanBioimpedance : null,
            photos: formData.photos.length > 0 ? formData.photos : null,
            results: {
                ...(compositionResults || {}),
                ...(frameSize && { frame_size: frameSize.size, frame_ratio: frameSize.ratio }),
                ...(somatotype && { somatotype })
            } || null
        };

        onSubmit(submitData, initialData?.id);
    };

    const handleReset = () => {
        setFormData({
            weight: '',
            height: '',
            record_date: new Date().toISOString().split('T')[0],
            notes: '',
            circumferences: {
                ombro: '', peito: '', cintura: '', abdomen: '', quadril: '',
                braco_relaxado_e: '', braco_relaxado_d: '',
                braco_contraido_e: '', braco_contraido_d: '',
                coxa_proximal_e: '', coxa_proximal_d: '',
                coxa_medial_e: '', coxa_medial_d: '',
                panturrilha_e: '', panturrilha_d: ''
            },
            skinfolds: {
                triceps: '', biceps: '', subescapular: '', suprailiaca: '',
                abdominal: '', coxa: '', panturrilha: ''
            },
            bone_diameters: {
                punho: '',
                femur: '',
                umero: ''
            },
            bioimpedance: {
                percent_gordura: '', percent_massa_magra: '', gordura_visceral: ''
            },
            photos: []
        });
        setErrors({});
        setCalculatedBMI(null);
        setIdealWeightRange(null);
        setCalculatedRCQ(null);
        setEstimatedBodyFat(null);
        if (onCancel) onCancel();
    };

    const getIMCCategory = (bmi) => {
        if (!bmi) return null;
        if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-600' };
        if (bmi < 25) return { label: 'Peso normal', color: 'text-green-600' };
        if (bmi < 30) return { label: 'Sobrepeso', color: 'text-yellow-600' };
        return { label: 'Obesidade', color: 'text-red-600' };
    };

    const getRCQCategory = (rcq) => {
        if (!rcq) return null;
        // Valores de referência: Homens < 0.90, Mulheres < 0.85 (saudável)
        // Como não temos gênero aqui, usamos valores médios
        if (rcq < 0.85) return { label: 'Baixo risco', color: 'text-green-600' };
        if (rcq < 0.95) return { label: 'Risco moderado', color: 'text-yellow-600' };
        return { label: 'Alto risco', color: 'text-red-600' };
    };

    const imcCategory = getIMCCategory(calculatedBMI);
    const rcqCategory = getRCQCategory(calculatedRCQ);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg md:text-lg tracking-wide" style={{ wordSpacing: '0.2em' }}>
                    {initialData ? 'Editar Registro' : 'Novo Registro Antropométrico'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Tabs defaultValue="basico" className="w-full">
                        <TabsList className="flex w-full flex-nowrap overflow-x-auto gap-1 p-1 md:grid md:grid-cols-5 md:overflow-visible">
                            <TabsTrigger value="basico" className="whitespace-nowrap shrink-0 text-xs md:text-sm px-2 md:px-3">Básico</TabsTrigger>
                            <TabsTrigger value="circunferencias" className="whitespace-nowrap shrink-0 text-xs md:text-sm px-2 md:px-3">Circunferências</TabsTrigger>
                            <TabsTrigger value="dobras" className="whitespace-nowrap shrink-0 text-xs md:text-sm px-2 md:px-3">Dobras & Comp.</TabsTrigger>
                            <TabsTrigger value="diametros" className="whitespace-nowrap shrink-0 text-xs md:text-sm px-2 md:px-3">Diâmetros</TabsTrigger>
                            <TabsTrigger value="fotos" className="whitespace-nowrap shrink-0 text-xs md:text-sm px-2 md:px-3">Fotos</TabsTrigger>
                        </TabsList>

                        {/* TAB 1: Básico */}
                        <TabsContent value="basico" className="space-y-4 mt-4">
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
                                    <DateInputWithCalendar
                                        id="record_date"
                                        name="record_date"
                                        value={formData.record_date}
                                        onChange={(value) => {
                                            setFormData(prev => ({ ...prev, record_date: value }));
                                            if (errors.record_date) {
                                                setErrors(prev => ({ ...prev, record_date: null }));
                                            }
                                        }}
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
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold">IMC Calculado:</span>
                                            <span className="text-lg font-bold">{calculatedBMI.toFixed(1)}</span>
                                            {imcCategory && (
                                                <Badge variant="outline" className={imcCategory.color}>
                                                    {imcCategory.label}
                                                </Badge>
                                            )}
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Peso Ideal */}
                            {idealWeightRange && (
                                <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                                    <Calculator className="h-4 w-4 text-blue-600" />
                                    <AlertDescription>
                                        <div className="space-y-1">
                                            <div className="font-semibold text-blue-900 dark:text-blue-100">
                                                Faixa de Peso Ideal (IMC 18.5-24.9):
                                            </div>
                                            <div className="text-sm text-blue-800 dark:text-blue-200">
                                                {idealWeightRange.min.toFixed(1)} kg - {idealWeightRange.max.toFixed(1)} kg
                                            </div>
                                            {idealWeightRange.current && (
                                                <div className="text-xs text-blue-700 dark:text-blue-300">
                                                    Peso atual: {idealWeightRange.current.toFixed(1)} kg
                                                    {idealWeightRange.current < idealWeightRange.min && (
                                                        <span className="ml-2">(Abaixo do ideal)</span>
                                                    )}
                                                    {idealWeightRange.current > idealWeightRange.max && (
                                                        <span className="ml-2">(Acima do ideal)</span>
                                                    )}
                                                    {idealWeightRange.current >= idealWeightRange.min && idealWeightRange.current <= idealWeightRange.max && (
                                                        <span className="ml-2">(Dentro do ideal)</span>
                                                    )}
                                                </div>
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
                                    placeholder="Adicione observações sobre o registro..."
                                    value={formData.notes}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                            </div>
                        </TabsContent>

                        {/* TAB 2: Circunferências */}
                        <TabsContent value="circunferencias" className="space-y-6 mt-4">
                            <div className="space-y-6">
                                {/* Tronco */}
                                <div>
                                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Ruler className="w-4 h-4" />
                                        Tronco
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                        {['ombro', 'peito', 'cintura', 'abdomen', 'quadril'].map(field => (
                                            <div key={field} className="space-y-2">
                                                <Label htmlFor={`circ_${field}`}>
                                                    {field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' ')} (cm)
                                                </Label>
                                                <Input
                                                    id={`circ_${field}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.circumferences[field] || ''}
                                                    onChange={(e) => handleNestedChange('circumferences', field, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Membros */}
                                <div>
                                    <h3 className="text-sm font-semibold mb-3">Membros (E/D)</h3>
                                    <div className="space-y-4">
                                        {[
                                            { key: 'braco_relaxado', label: 'Braço Relaxado' },
                                            { key: 'braco_contraido', label: 'Braço Contraído' },
                                            { key: 'coxa_proximal', label: 'Coxa Proximal' },
                                            { key: 'coxa_medial', label: 'Coxa Medial' },
                                            { key: 'panturrilha', label: 'Panturrilha' }
                                        ].map(({ key, label }) => (
                                            <div key={key} className="grid grid-cols-3 gap-4">
                                                <Label className="col-span-3 text-xs text-muted-foreground">{label}</Label>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`circ_${key}_e`}>Esquerdo (cm)</Label>
                                                    <Input
                                                        id={`circ_${key}_e`}
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        placeholder="0.0"
                                                        value={formData.circumferences[`${key}_e`] || ''}
                                                        onChange={(e) => handleNestedChange('circumferences', `${key}_e`, e.target.value)}
                                                        disabled={loading}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`circ_${key}_d`}>Direito (cm)</Label>
                                                    <Input
                                                        id={`circ_${key}_d`}
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        placeholder="0.0"
                                                        value={formData.circumferences[`${key}_d`] || ''}
                                                        onChange={(e) => handleNestedChange('circumferences', `${key}_d`, e.target.value)}
                                                        disabled={loading}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`circ_${key}_media`}>Média (cm)</Label>
                                                    <Input
                                                        id={`circ_${key}_media`}
                                                        type="number"
                                                        step="0.1"
                                                        disabled
                                                        value={
                                                            formData.circumferences[`${key}_e`] && formData.circumferences[`${key}_d`]
                                                                ? ((parseFloat(formData.circumferences[`${key}_e`]) + parseFloat(formData.circumferences[`${key}_d`])) / 2).toFixed(1)
                                                                : ''
                                                        }
                                                        className="bg-muted"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* RCQ Calculado */}
                                {calculatedRCQ && (
                                    <Alert className="bg-muted/50">
                                        <Calculator className="h-4 w-4" />
                                        <AlertDescription>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold">RCQ (Relação Cintura-Quadril):</span>
                                                <span className="text-lg font-bold">{calculatedRCQ.toFixed(2)}</span>
                                                {rcqCategory && (
                                                    <Badge variant="outline" className={rcqCategory.color}>
                                                        {rcqCategory.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                )}

                            </div>
                        </TabsContent>

                        {/* TAB 3: Dobras & Composição */}
                        <TabsContent value="dobras" className="space-y-6 mt-4">
                            {/* Seletor de Protocolo */}
                            <div className="space-y-2">
                                <Label htmlFor="protocol">Protocolo de Cálculo</Label>
                                <Select value={protocol} onValueChange={setProtocol}>
                                    <SelectTrigger id="protocol">
                                        <SelectValue placeholder="Selecione o protocolo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pollock3">Pollock 3 Dobras (Tríceps, Subescapular, Suprailíaca)</SelectItem>
                                        <SelectItem value="pollock7">Pollock 7 Dobras (Peito, Axilar, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa)</SelectItem>
                                        <SelectItem value="weltman">Weltman 4 Dobras (Tríceps, Bíceps, Subescapular, Suprailíaca)</SelectItem>
                                        <SelectItem value="bioimpedance">Bioimpedância (Direto)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {protocol === 'pollock3' && 'Requer: Tríceps, Subescapular, Suprailíaca, Idade, Gênero'}
                                    {protocol === 'pollock7' && 'Requer: Peito, Axilar, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa, Idade, Gênero'}
                                    {protocol === 'weltman' && 'Requer: Tríceps, Bíceps, Subescapular, Suprailíaca, Idade, Gênero'}
                                    {protocol === 'bioimpedance' && 'Use os valores de bioimpedância diretamente'}
                                </p>
                            </div>

                            {/* Inputs Dinâmicos baseados no Protocolo */}
                            {protocol !== 'bioimpedance' && (
                                <div>
                                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Scissors className="w-4 h-4" />
                                        Dobras Cutâneas (mm)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* Pollock 3 */}
                                        {protocol === 'pollock3' && [
                                            { key: 'triceps', label: 'Tríceps', required: true },
                                            { key: 'subescapular', label: 'Subescapular', required: true },
                                            { key: 'suprailiaca', label: 'Suprailíaca', required: true }
                                        ].map(({ key, label, required }) => (
                                            <div key={key} className="space-y-2">
                                                <Label htmlFor={`fold_${key}`}>
                                                    {label} (mm) {required && <span className="text-destructive">*</span>}
                                                </Label>
                                                <Input
                                                    id={`fold_${key}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.skinfolds[key] || ''}
                                                    onChange={(e) => handleNestedChange('skinfolds', key, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}

                                        {/* Pollock 7 */}
                                        {protocol === 'pollock7' && [
                                            { key: 'peito', label: 'Peito', required: true },
                                            { key: 'axilar', label: 'Axilar', required: true },
                                            { key: 'triceps', label: 'Tríceps', required: true },
                                            { key: 'subescapular', label: 'Subescapular', required: true },
                                            { key: 'abdominal', label: 'Abdominal', required: true },
                                            { key: 'suprailiaca', label: 'Suprailíaca', required: true },
                                            { key: 'coxa', label: 'Coxa', required: true }
                                        ].map(({ key, label, required }) => (
                                            <div key={key} className="space-y-2">
                                                <Label htmlFor={`fold_${key}`}>
                                                    {label} (mm) {required && <span className="text-destructive">*</span>}
                                                </Label>
                                                <Input
                                                    id={`fold_${key}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.skinfolds[key] || ''}
                                                    onChange={(e) => handleNestedChange('skinfolds', key, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}

                                        {/* Weltman */}
                                        {protocol === 'weltman' && [
                                            { key: 'triceps', label: 'Tríceps', required: true },
                                            { key: 'biceps', label: 'Bíceps', required: true },
                                            { key: 'subescapular', label: 'Subescapular', required: true },
                                            { key: 'suprailiaca', label: 'Suprailíaca', required: true }
                                        ].map(({ key, label, required }) => (
                                            <div key={key} className="space-y-2">
                                                <Label htmlFor={`fold_${key}`}>
                                                    {label} (mm) {required && <span className="text-destructive">*</span>}
                                                </Label>
                                                <Input
                                                    id={`fold_${key}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.skinfolds[key] || ''}
                                                    onChange={(e) => handleNestedChange('skinfolds', key, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Bioimpedância */}
                            <div>
                                <h3 className="text-sm font-semibold mb-3">Bioimpedância</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="bio_percent_gordura">
                                            % Gordura Corporal {protocol === 'bioimpedance' && <span className="text-destructive">*</span>}
                                        </Label>
                                        <Input
                                            id="bio_percent_gordura"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="100"
                                            placeholder="0.0"
                                            value={formData.bioimpedance.percent_gordura || ''}
                                            onChange={(e) => handleNestedChange('bioimpedance', 'percent_gordura', e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bio_percent_massa_magra">% Massa Magra</Label>
                                        <Input
                                            id="bio_percent_massa_magra"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="100"
                                            placeholder="0.0"
                                            value={formData.bioimpedance.percent_massa_magra || ''}
                                            onChange={(e) => handleNestedChange('bioimpedance', 'percent_massa_magra', e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bio_gordura_visceral">Gordura Visceral</Label>
                                        <Input
                                            id="bio_gordura_visceral"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bioimpedance.gordura_visceral || ''}
                                            onChange={(e) => handleNestedChange('bioimpedance', 'gordura_visceral', e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Resultados Calculados em Tempo Real */}
                            <Card className="bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-950/20 dark:to-blue-950/20 border-emerald-200 dark:border-emerald-800">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Calculator className="w-5 h-5 text-emerald-600" />
                                        Resultados Calculados em Tempo Real
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        Protocolo: {protocol === 'pollock3' ? 'Pollock 3 Dobras' : protocol === 'pollock7' ? 'Pollock 7 Dobras' : protocol === 'weltman' ? 'Weltman 4 Dobras' : 'Bioimpedância'}
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    {compositionResults ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Densidade Corporal</p>
                                                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                                                        {compositionResults.body_density?.toFixed(4) || 'N/A'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">g/cm³</p>
                                                </div>
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">% Gordura Corporal</p>
                                                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                                                        {compositionResults.body_fat_percent?.toFixed(1) || 'N/A'}%
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Percentual de gordura</p>
                                                </div>
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Massa Gorda</p>
                                                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                                                        {compositionResults.fat_mass_kg?.toFixed(1) || 'N/A'} kg
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Peso de gordura</p>
                                                </div>
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Massa Magra</p>
                                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                                        {compositionResults.lean_mass_kg?.toFixed(1) || 'N/A'} kg
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Peso sem gordura</p>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-emerald-200 dark:border-emerald-800">
                                                <p className="text-xs text-muted-foreground">
                                                    *Cálculos baseados em {protocol === 'pollock3' ? 'Jackson & Pollock (1985) - 3 dobras' : protocol === 'pollock7' ? 'Jackson & Pollock (1985) - 7 dobras' : protocol === 'weltman' ? 'Weltman et al. (1988)' : 'Bioimpedância direta'} e equação de Siri (1961) para conversão de densidade em % de gordura.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">
                                                Preencha os dados necessários para ver os resultados calculados
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Aviso se faltar dados */}
                            {!compositionResults && protocol !== 'bioimpedance' && (
                                <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                                    <AlertCircle className="h-4 w-4 text-amber-600" />
                                    <AlertDescription>
                                        <p className="text-sm text-amber-900 dark:text-amber-100">
                                            Preencha todas as dobras cutâneas necessárias para o protocolo selecionado e certifique-se de que o paciente tem idade e gênero cadastrados no perfil.
                                        </p>
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Resultados Avançados: Somatotipo */}
                            {somatotype && (
                                <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-800">
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Calculator className="w-5 h-5 text-purple-600" />
                                            Somatotipo (Heath-Carter)
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground">
                                            Classificação da composição corporal
                                        </p>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="space-y-1 text-center p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Endomorfia</p>
                                                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                                                        {somatotype.endo}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Gordura relativa</p>
                                                </div>
                                                <div className="space-y-1 text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Mesomorfia</p>
                                                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                                                        {somatotype.meso}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Massa muscular/óssea</p>
                                                </div>
                                                <div className="space-y-1 text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Ectomorfia</p>
                                                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                                                        {somatotype.ecto}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Linearidade</p>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-purple-200 dark:border-purple-800">
                                                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
                                                    Classificação:
                                                </p>
                                                <p className="text-lg font-bold text-purple-800 dark:text-purple-200">
                                                    {getSomatotypeDescription(somatotype.endo, somatotype.meso, somatotype.ecto)}
                                                </p>
                                                <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
                                                    Coordenadas para Somatochart: X = {somatotype.x}, Y = {somatotype.y}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        {/* TAB 4: Diâmetros Ósseos */}
                        <TabsContent value="diametros" className="space-y-6 mt-4">
                            <div>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <Ruler className="w-4 h-4" />
                                    Diâmetros Ósseos (cm)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="bone_punho">Punho (Estiloide) (cm)</Label>
                                        <Input
                                            id="bone_punho"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bone_diameters?.punho || ''}
                                            onChange={(e) => handleNestedChange('bone_diameters', 'punho', e.target.value)}
                                            disabled={loading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Medida do processo estilóide do rádio
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bone_femur">Fêmur (Biepicondilar) (cm)</Label>
                                        <Input
                                            id="bone_femur"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bone_diameters?.femur || ''}
                                            onChange={(e) => handleNestedChange('bone_diameters', 'femur', e.target.value)}
                                            disabled={loading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Largura biepicondilar do fêmur
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bone_umero">Úmero (Biepicondilar) (cm)</Label>
                                        <Input
                                            id="bone_umero"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bone_diameters?.umero || ''}
                                            onChange={(e) => handleNestedChange('bone_diameters', 'umero', e.target.value)}
                                            disabled={loading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Largura biepicondilar do úmero
                                        </p>
                                    </div>
                                </div>

                                {/* Frame Size Calculado */}
                                {frameSize && (
                                    <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 mt-4">
                                        <Calculator className="h-4 w-4 text-blue-600" />
                                        <AlertDescription>
                                            <div className="space-y-1">
                                                <div className="font-semibold text-blue-900 dark:text-blue-100">
                                                    Compleição Óssea (Frame Size):
                                                </div>
                                                <div className="text-lg font-bold text-blue-800 dark:text-blue-200">
                                                    {frameSize.label}
                                                </div>
                                                <div className="text-xs text-blue-700 dark:text-blue-300">
                                                    Ratio Altura/Punho: {frameSize.ratio.toFixed(2)}
                                                </div>
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </TabsContent>

                        {/* TAB 5: Fotos */}
                        <TabsContent value="fotos" className="mt-4">
                            <PhotoGallery
                                recordId={initialData?.id || `temp-${Date.now()}`}
                                initialPhotos={formData.photos}
                                onPhotosChange={handlePhotosChange}
                            />
                        </TabsContent>
                    </Tabs>

                    {/* Botões */}
                    <div className="flex gap-2 justify-end pt-4 border-t">
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
