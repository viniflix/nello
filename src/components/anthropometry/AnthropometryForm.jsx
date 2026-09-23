import React, { useState, useEffect, useMemo } from 'react';
import { Save, X, Calculator, Ruler, Scissors, Image as ImageIcon, AlertCircle, Bone } from 'lucide-react';
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
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';
import PhotoGallery from './PhotoGallery';
import { differenceInYears, parseISO } from 'date-fns';
import {
  calculateFrameSize,
  calculateSomatotype,
  getSomatotypeDescription,
  calculateBodyDensity,
  calculateBodyFatPercent,
  calculatePollockComposition,
  getPollockSex,
  POLLOCK_SITES
} from '@/lib/utils/anthropometry-calculations';
import { classifyBMI, getBMICuts, calculateBMI } from '@/lib/utils/bmi-classification';

const AnthropometryForm = ({
    patientId,
    initialData = null,
    onSubmit,
    onCancel,
    loading = false,
    patientGender = null,
    patientBirthDate = null,
    patientEthnicity = null
}) => {
    const [activeTab, setActiveTab] = useState('basico');
    const [formData, setFormData] = useState({
        weight: '',
        height: '',
        peso_usual: '',
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
            // Campos adicionais para Pollock 7 e Durnin
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
    const [errors, setErrors] = useState({});
    const [protocol, setProtocol] = useState('pollock7');
    const [frameSize, setFrameSize] = useState(null);
    const [somatotype, setSomatotype] = useState(null);
    const [manualAge, setManualAge] = useState('');
    const pollockSex = getPollockSex(patientGender);
    const ageAtRecord = useMemo(() => {
        if (manualAge !== '') return /^\d+$/.test(manualAge) ? Number(manualAge) : null;
        if (!patientBirthDate || !formData.record_date) return null;
        const age = differenceInYears(parseISO(formData.record_date), parseISO(patientBirthDate));
        return Number.isInteger(age) ? age : null;
    }, [manualAge, patientBirthDate, formData.record_date]);

    const compositionResults = useMemo(() => {
        const weight = Number(formData.weight);
        if (!Number.isFinite(weight) || weight <= 0) return null;

        if (protocol === 'bioimpedance') {
            const percent = Number(formData.bioimpedance?.percent_gordura);
            if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return null;
            const fatMass = weight * percent / 100;
            return { body_density: null, body_fat_percent: percent, fat_mass_kg: fatMass,
                lean_mass_kg: weight - fatMass, protocol };
        }

        if (!pollockSex || ageAtRecord === null) return null;
        if (protocol === 'pollock3' || protocol === 'pollock7') {
            const calculated = calculatePollockComposition({ skinfolds: formData.skinfolds, age: ageAtRecord,
                sex: pollockSex, weight, protocol });
            return calculated ? { ...calculated, age_source: manualAge !== '' ? 'manual' : 'birth_date' } : null;
        }
        if (protocol === 'durnin') {
            const density = calculateBodyDensity(formData.skinfolds, ageAtRecord, pollockSex === 'male', protocol);
            const percent = calculateBodyFatPercent(density);
            if (percent === null) return null;
            const fatMass = weight * percent / 100;
            return { body_density: density, body_fat_percent: percent, fat_mass_kg: fatMass,
                lean_mass_kg: weight - fatMass, protocol, age_years: ageAtRecord, sex_used: pollockSex };
        }
        return null;
    }, [formData.weight, formData.skinfolds, formData.bioimpedance, protocol, pollockSex, ageAtRecord, manualAge]);

    // Buscar último registro antropométrico e dados da anamnese para preencher formulário
    useEffect(() => {
        const fetchSources = async () => {
            if (!initialData && patientId) {
                const [anthropometryRes, anamnesisRes] = await Promise.all([
                    getLatestAnthropometryRecord(patientId),
                    getLatestAnamnesis(patientId, true)
                ]);
                if (anthropometryRes.data) setLastRecord(anthropometryRes.data);

                const content = anamnesisRes.data?.content;
                if (content?.objetivos?.peso_atual) {
                    const peso = parseFloat(content.objetivos.peso_atual);
                    if (peso > 0) {
                        setFormData(prev => ({ ...prev, weight: String(peso) }));
                    }
                }
            }
        };
        fetchSources();
    }, [patientId, initialData]);

    // Preencher formulário se estiver editando
    useEffect(() => {
        if (initialData) {
            setProtocol(initialData.results?.protocol || 'pollock7');
            setManualAge(initialData.results?.age_source === 'manual' ? String(initialData.results.age_years) : '');
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

    // IMC é exibido como apoio. Faixas pediátricas exigem curvas OMS completas.
    useEffect(() => {
        const { weight, height } = formData;
        if (weight && height) {
            const heightM = parseFloat(height) / 100;
            const bmi = parseFloat(weight) / Math.pow(heightM, 2);
            setCalculatedBMI(bmi);

            const cuts = getBMICuts({ age: ageAtRecord });
            const weightNow = parseFloat(weight);
            setIdealWeightRange(cuts ? {
                min: cuts.underweight * Math.pow(heightM, 2),
                max: cuts.normal_high * Math.pow(heightM, 2),
                current: weightNow, low: cuts.underweight, high: cuts.normal_high,
            } : null);
        } else {
            setCalculatedBMI(null);
            setIdealWeightRange(null);
        }
    }, [formData.weight, formData.height, ageAtRecord]);

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

    // Calcular Frame Size (Compleição Óssea)
    useEffect(() => {
        const height = parseFloat(formData.height);
        const wrist = parseFloat(formData.bone_diameters?.punho);
        if (height && wrist && pollockSex) {
            const frame = calculateFrameSize(height, wrist, pollockSex === 'male');
            setFrameSize(frame);
        } else {
            setFrameSize(null);
        }
    }, [formData.height, formData.bone_diameters?.punho, pollockSex]);

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
                isMale: pollockSex === 'male'
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
        pollockSex
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
        const hasWeight = formData.weight && parseFloat(formData.weight) > 0;
        const hasHeight = formData.height && parseFloat(formData.height) > 0;
        const hasCircumferences = Object.values(formData.circumferences || {}).some((v) => v && v !== '');
        const hasSkinfolds = Object.values(formData.skinfolds || {}).some((v) => v && v !== '');
        const hasBoneDiameters = Object.values(formData.bone_diameters || {}).some((v) => v && v !== '');
        const hasBioimpedance = Object.values(formData.bioimpedance || {}).some((v) => v && v !== '');
        const hasPhotos = Array.isArray(formData.photos) && formData.photos.length > 0;

        if (!formData.record_date) {
            newErrors.record_date = 'Data é obrigatória';
        }

        if ((hasWeight && !hasHeight) || (!hasWeight && hasHeight)) {
            newErrors.weight = 'Para seção básica, preencha peso e altura juntos';
            newErrors.height = 'Para seção básica, preencha peso e altura juntos';
        }

        const hasAnySectionData =
            (hasWeight && hasHeight) ||
            hasCircumferences ||
            hasSkinfolds ||
            hasBoneDiameters ||
            hasBioimpedance ||
            hasPhotos;

        if (!hasAnySectionData) {
            newErrors.form = 'Preencha ao menos uma seção (básico, circunferências, dobras, diâmetros ou fotos).';
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

        const parsedWeight = formData.weight && parseFloat(formData.weight) > 0
            ? parseFloat(formData.weight)
            : null;
        const parsedHeight = formData.height && parseFloat(formData.height) > 0
            ? parseFloat(formData.height)
            : null;

        const submitData = {
            patient_id: patientId,
            weight: parsedWeight,
            height: parsedHeight,
            peso_usual: formData.peso_usual && parseFloat(formData.peso_usual) > 0 ? parseFloat(formData.peso_usual) : null,
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
                ...(somatotype && { somatotype }),
                ...(calculatedBMI && imcCategory && { bmi_assessment: { value: calculatedBMI, label: imcCategory.label, method: imcCategory.method, source: imcCategory.source, requires_professional_validation: true } })
            } || null,
            protocol_code: calculatedBMI ? (imcCategory?.method === 'idoso_sisvan' ? 'anthropometry.bmi_elderly_sisvan' : imcCategory?.method === 'pediatrico_pendente_curva_oms' ? 'anthropometry.pediatric_who_lms' : 'anthropometry.bmi_adult') : null,
            protocol_version: calculatedBMI ? 1 : null,
            source_snapshot: calculatedBMI ? { classification_method: imcCategory?.method, source: imcCategory?.source, automated_diagnosis: false } : { entry_method: 'professional_measurement' }
        };

        onSubmit(submitData, initialData?.id);
    };

    const handleReset = () => {
        setFormData({
            weight: '',
            height: '',
            peso_usual: '',
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
        setProtocol('pollock7');
        setManualAge('');
        if (onCancel) onCancel();
    };

    // RCQ com diferenciação por sexo (OMS: H<0.90, M<0.85 = baixo risco)
    const getRCQCategory = (rcq) => {
        if (!rcq || !pollockSex) return null;
        const threshold = pollockSex === 'male' ? 0.90 : 0.85;
        if (rcq < threshold) return { label: 'Baixo risco', color: 'text-green-600' };
        if (rcq < threshold + 0.10) return { label: 'Risco moderado', color: 'text-yellow-600' };
        return { label: 'Alto risco', color: 'text-red-600' };
    };

    const age = ageAtRecord;
    const imcCategory = calculatedBMI
        ? classifyBMI({ bmi: calculatedBMI, age, sex: patientGender, ethnicity: patientEthnicity })
        : null;
    const rcqCategory = getRCQCategory(calculatedRCQ);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg md:text-xl tracking-wide" style={{ wordSpacing: '0.16em' }}>
                    {initialData ? 'Revisão de Registro' : 'Registro Antropométrico'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {errors.form && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{errors.form}</AlertDescription>
                        </Alert>
                    )}

                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Você pode registrar tudo de uma vez ou apenas as seções avaliadas nesta consulta.
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        {/* Mobile: seletor único de seção (mais limpo que grade de botões) */}
                        <div className="md:hidden mb-3">
                            <Label className="text-xs text-muted-foreground mb-1.5 block">
                                Seção do registro
                            </Label>
                            <Select name="active-tab" value={activeTab} onValueChange={setActiveTab}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Selecione uma seção" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="basico">Básico</SelectItem>
                                    <SelectItem value="circunferencias">Circunferências</SelectItem>
                                    <SelectItem value="dobras">Dobras & Composição</SelectItem>
                                    <SelectItem value="diametros">Diâmetros Ósseos</SelectItem>
                                    <SelectItem value="fotos">Fotos</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Desktop: mantém abas clássicas */}
                        <TabsList className="hidden md:grid w-full md:grid-cols-5 gap-1 h-auto p-1">
                            <TabsTrigger value="basico" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Básico
                            </TabsTrigger>
                            <TabsTrigger value="circunferencias" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Circunferências
                            </TabsTrigger>
                            <TabsTrigger value="dobras" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Dobras & Composição
                            </TabsTrigger>
                            <TabsTrigger value="diametros" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Diâmetros Ósseos
                            </TabsTrigger>
                            <TabsTrigger value="fotos" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Fotos
                            </TabsTrigger>
                        </TabsList>

                        {/* TAB 1: Básico */}
                        <TabsContent value="basico" className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Peso */}
                                <div className="space-y-2">
                                    <Label htmlFor="weight">Peso (kg)</Label>
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
                                {/* Peso Usual */}
                                <div className="space-y-2">
                                    <Label htmlFor="peso_usual">
                                        Peso Usual (kg)
                                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                                            (Opcional)
                                        </span>
                                    </Label>
                                    <Input
                                        id="peso_usual"
                                        name="peso_usual"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        placeholder="Ex: 72"
                                        value={formData.peso_usual}
                                        onChange={handleChange}
                                        className={errors.peso_usual ? 'border-destructive' : ''}
                                        disabled={loading}
                                    />
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Peso habitual do paciente antes de qualquer processo intencional de perda ou ganho de peso.
                                    </p>
                                </div>

                                {/* Altura */}
                                <div className="space-y-2">
                                    <Label htmlFor="height">Altura (cm)</Label>
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



                            {/* ── Cards de Resultados ── */}
                            {calculatedBMI && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                                    {/* IMC */}
                                    <Alert className="bg-muted/50">
                                        <Calculator className="h-4 w-4" />
                                        <AlertDescription>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold">IMC:</span>
                                                    <span
                                                        className="text-lg font-bold cursor-help underline decoration-dotted"
                                                        title={`Fórmula: ${formData.weight} ÷ (${formData.height} ÷ 100)² = ${calculatedBMI.toFixed(2)}`}
                                                    >
                                                        {calculatedBMI.toFixed(1)}
                                                    </span>
                                                    {imcCategory && (
                                                        <Badge variant="outline" className={imcCategory.color}>
                                                            {imcCategory.label}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {imcCategory?.detail && (
                                                    <p className="text-xs text-muted-foreground">{imcCategory.detail}</p>
                                                )}
                                                <p className="text-xs text-muted-foreground italic">Passe o mouse no valor para ver a fórmula</p>
                                            </div>
                                        </AlertDescription>
                                    </Alert>

                                    {/* Faixa de referência: não é meta nem peso ideal */}
                                    {idealWeightRange && (
                                        <Alert className="bg-muted/30 border-muted">
                                            <Calculator className="h-4 w-4 text-muted-foreground" />
                                            <AlertDescription>
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-sm">
                                                        Faixa de referência do IMC ({idealWeightRange.low}–{idealWeightRange.high})
                                                    </div>
                                                    <div className="text-sm">
                                                        {idealWeightRange.min.toFixed(1)} – {idealWeightRange.max.toFixed(1)} kg
                                                    </div>
                                                    {idealWeightRange.current && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Peso atual: {idealWeightRange.current.toFixed(1)} kg
                                                            {idealWeightRange.current < idealWeightRange.min && <span className="ml-1 text-blue-600">(Abaixo da faixa)</span>}
                                                            {idealWeightRange.current > idealWeightRange.max && <span className="ml-1 text-yellow-600">(Acima da faixa)</span>}
                                                            {idealWeightRange.current >= idealWeightRange.min && idealWeightRange.current <= idealWeightRange.max && <span className="ml-1 text-green-600">(Na faixa)</span>}
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">APOIO À AVALIAÇÃO — NÃO REPRESENTA META OU “PESO IDEAL”.</p>
                                                </div>
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
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
                                                    name={`circ_${field}`}
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
                                                        name={`circ_${key}_e`}
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
                                                        name={`circ_${key}_d`}
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
                                                        name={`circ_${key}_media`}
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

                                {/* Diâmetros Ósseos */}
                                <div>
                                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Bone className="w-4 h-4" />
                                        Diâmetros Ósseos (cm)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="bone_punho">Punho (cm)</Label>
                                            <Input
                                                id="bone_punho"
                                                name="bone_punho"
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                placeholder="0.0"
                                                value={formData.bone_diameters?.punho || ''}
                                                onChange={(e) => handleNestedChange('bone_diameters', 'punho', e.target.value)}
                                                disabled={loading}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="bone_femur">Fêmur (cm)</Label>
                                            <Input
                                                id="bone_femur"
                                                name="bone_femur"
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                placeholder="0.0"
                                                value={formData.bone_diameters?.femur || ''}
                                                onChange={(e) => handleNestedChange('bone_diameters', 'femur', e.target.value)}
                                                disabled={loading}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="bone_umero">Úmero (cm)</Label>
                                            <Input
                                                id="bone_umero"
                                                name="bone_umero"
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                placeholder="0.0"
                                                value={formData.bone_diameters?.umero || ''}
                                                onChange={(e) => handleNestedChange('bone_diameters', 'umero', e.target.value)}
                                                disabled={loading}
                                            />
                                        </div>
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
                                <Select name="protocol" value={protocol} onValueChange={setProtocol}>
                                    <SelectTrigger id="protocol">
                                        <SelectValue placeholder="Selecione o protocolo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pollock3">Pollock 3 Dobras (locais conforme sexo)</SelectItem>
                                        <SelectItem value="pollock7">Pollock 7 Dobras (Peito, Axilar, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa)</SelectItem>
                                        <SelectItem value="durnin">Durnin & Womersley 4 Dobras (Tríceps, Bíceps, Subescapular, Suprailíaca)</SelectItem>
                                        <SelectItem value="bioimpedance">Bioimpedância (Direto)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {protocol === 'pollock3' && (pollockSex === 'male' ? 'Requer: Peito, Abdômen, Coxa, idade e sexo' : pollockSex === 'female' ? 'Requer: Tríceps, Suprailíaca, Coxa, idade e sexo' : 'Informe o sexo do paciente no cadastro para escolher as dobras corretas')}
                                    {protocol === 'pollock7' && 'Requer: Peito, Axilar, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa, Idade, Gênero'}
                                    {protocol === 'durnin' && 'Requer: Tríceps, Bíceps, Subescapular, Suprailíaca, Idade, Gênero'}
                                    {protocol === 'bioimpedance' && 'Use os valores de bioimpedância diretamente'}
                                </p>
                            </div>

                            {protocol !== 'bioimpedance' && (
                                <div className="space-y-2 max-w-xs">
                                    <Label htmlFor="manualAge">Idade na data do registro (anos)</Label>
                                    <Input
                                        id="manualAge"
                                        name="manualAge"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={manualAge}
                                        onChange={(e) => setManualAge(e.target.value)}
                                        placeholder={patientBirthDate ? `Calculada: ${ageAtRecord ?? 'indisponível'}` : 'Informe a idade'}
                                    />
                                    <p className="text-xs text-muted-foreground">{patientBirthDate ? 'Calculada pela data de nascimento e do registro. Preencha para corrigir.' : 'Obrigatória porque não há data de nascimento cadastrada.'}</p>
                                </div>
                            )}

                            {/* Inputs Dinâmicos baseados no Protocolo */}
                            {protocol !== 'bioimpedance' && (
                                <div>
                                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Scissors className="w-4 h-4" />
                                        Dobras Cutâneas (mm)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* Pollock 3 */}
                                        {protocol === 'pollock3' && (POLLOCK_SITES.pollock3[pollockSex] || []).map((key) => (
                                            <div key={key} className="space-y-2">
                                                <Label htmlFor={`fold_${key}`}>
                                                    {({ peito: 'Peito', abdominal: 'Abdômen', coxa: 'Coxa', triceps: 'Tríceps', suprailiaca: 'Suprailíaca' })[key]} (mm) <span className="text-destructive">*</span>
                                                </Label>
                                                <Input
                                                    id={`fold_${key}`}
                                                    name={`fold_${key}`}
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
                                                    name={`fold_${key}`}
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

                                        {/* Durnin */}
                                        {protocol === 'durnin' && [
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
                                                    name={`fold_${key}`}
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
                                        Protocolo: {protocol === 'pollock3' ? 'Pollock 3 Dobras' : protocol === 'pollock7' ? 'Pollock 7 Dobras' : protocol === 'durnin' ? 'Durnin & Womersley 4 Dobras' : 'Bioimpedância'}
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
                                                    *Cálculos baseados em {protocol === 'pollock3' || protocol === 'pollock7' ? 'Jackson & Pollock (1978, homens) / Jackson, Pollock & Ward (1980, mulheres)' : protocol === 'durnin' ? 'Durnin & Womersley (1974)' : 'Bioimpedância direta'} e equação de Siri (1961) para conversão de densidade em % de gordura.
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
                                            {(!pollockSex) ? 'Informe o sexo do paciente no cadastro para calcular a composição corporal.' : (protocol === 'pollock3' || protocol === 'pollock7') && (ageAtRecord === null || ageAtRecord < 18 || ageAtRecord > (pollockSex === 'male' ? 61 : 55)) ? `Informe uma idade válida na data do registro (18 a ${pollockSex === 'male' ? 61 : 55} anos para esta equação).` : 'Preencha peso e todas as dobras necessárias com valores positivos. Confira medidas e idade se o resultado continuar indisponível.'}
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
                                patientId={patientId}
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
