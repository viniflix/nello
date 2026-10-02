import { getTodayIsoDate } from '@/lib/utils/date';
import { useState, useEffect, useMemo } from 'react';











import { getLatestAnthropometryRecord } from '@/lib/supabase/anthropometry-queries';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';

import { differenceInYears, parseISO } from 'date-fns';
import { calculateFrameSize, calculateSomatotype, calculateBodyDensity, calculateBodyFatPercent, calculatePollockComposition, getPollockSex, DURNIN_REFERENCE } from '@/lib/utils/anthropometry-calculations';
import { classifyBMI, getBMICuts } from '@/lib/utils/bmi-classification';
export function useAnthropometryFormController({
    patientId,
    initialData = null,
    onSubmit,
    onCancel,
    loading = false,
    patientGender = null,
    patientBirthDate = null,
    patientEthnicity = null
}) {

    const [activeTab, setActiveTab] = useState('basico');
    const [formData, setFormData] = useState({
        weight: '',
        height: '',
        peso_usual: '',
        record_date: getTodayIsoDate(),
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
                lean_mass_kg: weight - fatMass, protocol, age_years: ageAtRecord, sex_used: pollockSex,
                equation_version: 2, formula_reference: DURNIN_REFERENCE,
                age_source: manualAge !== '' ? 'manual' : 'birth_date' };
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
                record_date: initialData.record_date || getTodayIsoDate(),
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

        const sectionLimits = [
            ['circumferences', 'Circunferência', 10, 300],
            ['skinfolds', 'Dobra cutânea', 1, 120],
            ['bone_diameters', 'Diâmetro ósseo', 1, 40],
            ['bioimpedance', 'Bioimpedância', 0, 1000],
        ];
        for (const [section, label, defaultMin, defaultMax] of sectionLimits) {
            for (const [field, rawValue] of Object.entries(formData[section] || {})) {
                if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
                const value = Number(rawValue);
                const min = section === 'bioimpedance'
                    ? ({ percent_gordura: 2, percent_massa_magra: 20, gordura_visceral: 1 }[field] ?? defaultMin)
                    : defaultMin;
                const max = section === 'bioimpedance'
                    ? ({ percent_gordura: 75, percent_massa_magra: 98, gordura_visceral: 40 }[field] ?? defaultMax)
                    : defaultMax;
                if (!Number.isFinite(value) || value < min || value > max) {
                    newErrors.form = `${label} (${field.replaceAll('_', ' ')}): informe um valor entre ${min} e ${max}. Campos não medidos devem ficar vazios.`;
                    break;
                }
            }
            if (newErrors.form && hasAnySectionData) break;
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
            record_date: getTodayIsoDate(),
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

    
return {handleSubmit,errors,activeTab,setActiveTab,lastRecord,formData,handleChange,setFormData,setErrors,calculatedBMI,imcCategory,idealWeightRange,handleNestedChange,calculatedRCQ,rcqCategory,protocol,setProtocol,pollockSex,manualAge,setManualAge,ageAtRecord,compositionResults,somatotype,frameSize,handlePhotosChange,handleReset};
}
