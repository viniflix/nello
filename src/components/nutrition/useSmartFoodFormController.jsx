import { mapFatSecretToOFF, normalizeExternalProduct } from '@/lib/utils/externalFood';
import { idempotentRpc } from '@/lib/supabase/idempotent-mutations';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useMemo, useImperativeHandle } from 'react';










import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { toPortugueseError } from '@/lib/utils/errorMessages';
export function useSmartFoodFormController({ 
    initialData = null,
    onSuccess,
    mode = 'full',
    initialName = ''
},ref) {

    const { toast } = useToast();
    const { user } = useAuth();
    
    // Wizard state
    const [currentStep, setCurrentStep] = useState(1);
    const totalSteps = 5;
    
    // Basic Info
    const [name, setName] = useState('');
    const [brand, setBrand] = useState('');
    
    // Input Mode
    const [inputMode, setInputMode] = useState('100g');
    const [prevInputMode, setPrevInputMode] = useState('100g');
    const [labelPortionSize, setLabelPortionSize] = useState(100);
    
    // Macronutrients
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [calories, setCalories] = useState('');
    const [autoCalcCalories, setAutoCalcCalories] = useState(true);
    
    // Additional Macronutrients
    const [fiber, setFiber] = useState('');
    const [sugar, setSugar] = useState('');
    const [saturatedFat, setSaturatedFat] = useState('');
    const [transFat, setTransFat] = useState('');
    const [monounsaturatedFat, setMonounsaturatedFat] = useState('');
    const [polyunsaturatedFat, setPolyunsaturatedFat] = useState('');
    const [cholesterol, setCholesterol] = useState('');
    const [sodium, setSodium] = useState('');
    
    // Minerals
    const [calcium, setCalcium] = useState('');
    const [iron, setIron] = useState('');
    const [magnesium, setMagnesium] = useState('');
    const [phosphorus, setPhosphorus] = useState('');
    const [potassium, setPotassium] = useState('');
    const [zinc, setZinc] = useState('');
    
    // Vitamins
    const [vitaminA, setVitaminA] = useState('');
    const [vitaminC, setVitaminC] = useState('');
    const [vitaminD, setVitaminD] = useState('');
    const [vitaminE, setVitaminE] = useState('');
    const [vitaminB12, setVitaminB12] = useState('');
    const [folate, setFolate] = useState('');
    
    // Other
    const [householdMeasures, setHouseholdMeasures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showResultsDialog, setShowResultsDialog] = useState(false);
    const [externalProvenance, setExternalProvenance] = useState(null);
    const [reviewedFingerprint, setReviewedFingerprint] = useState(null);
    const [foodRevision, setFoodRevision] = useState(null);
    const reviewFingerprint = JSON.stringify([name,brand,inputMode,labelPortionSize,protein,carbs,fat,calories,
        fiber,sugar,saturatedFat,transFat,monounsaturatedFat,polyunsaturatedFat,cholesterol,sodium,
        calcium,iron,magnesium,phosphorus,potassium,zinc,vitaminA,vitaminC,vitaminD,vitaminE,vitaminB12,folate,householdMeasures]);
    const externalReviewed = reviewedFingerprint === reviewFingerprint;
    useEffect(() => {
        if (!initialData?.id || !['custom','CUSTOM'].includes(initialData.source)) return;
        let cancelled = false;
        void supabase.from('nutritionist_foods').select('revision, external_provenance')
            .eq('id',initialData.id).maybeSingle().then(({data,error}) => {
                if (cancelled) return;
                if (!error && data) { setFoodRevision(data.revision);setExternalProvenance(data.external_provenance); }
            });
        return () => { cancelled = true; };
    },[initialData?.id,initialData?.source]);


    // Pre-fill from initialData
    useEffect(() => {
        if (initialData) {
            setName(initialData.name || '');
            setBrand(initialData.description?.replace('Marca: ', '') || '');
            setProtein(initialData.protein?.toString() || '');
            setCarbs(initialData.carbs?.toString() || '');
            setFat(initialData.fat?.toString() || '');
            setCalories(initialData.calories?.toString() || '');
            setFiber(initialData.fiber?.toString() || '');
            setSodium(initialData.sodium?.toString() || '');
            setSugar(initialData.sugar?.toString() || '');
            setSaturatedFat(initialData.saturated_fat?.toString() || '');
            setTransFat(initialData.trans_fat?.toString() || '');
            setMonounsaturatedFat(initialData.monounsaturated_fat?.toString() || '');
            setPolyunsaturatedFat(initialData.polyunsaturated_fat?.toString() || '');
            setCholesterol(initialData.cholesterol?.toString() || '');
            setCalcium(initialData.calcium?.toString() || '');
            setIron(initialData.iron?.toString() || '');
            setMagnesium(initialData.magnesium?.toString() || '');
            setPhosphorus(initialData.phosphorus?.toString() || '');
            setPotassium(initialData.potassium?.toString() || '');
            setZinc(initialData.zinc?.toString() || '');
            setVitaminA(initialData.vitamin_a?.toString() || '');
            setVitaminC(initialData.vitamin_c?.toString() || '');
            setVitaminD(initialData.vitamin_d?.toString() || '');
            setVitaminE(initialData.vitamin_e?.toString() || '');
            setVitaminB12(initialData.vitamin_b12?.toString() || '');
            setFolate(initialData.folate?.toString() || '');
            setAutoCalcCalories(false);
            setInputMode('100g');
            
            // Load household measures if available
            if (initialData.food_measures && Array.isArray(initialData.food_measures)) {
                setHouseholdMeasures(
                    initialData.food_measures.map(measure => ({
                        id: measure.id,
                        label: measure.measure_label,
                        grams: measure.quantity_grams
                    }))
                );
            }
        } else if (initialName) {
            setName(initialName);
        }
    }, [initialData, initialName]);

    // Calculate normalized values
    const normalizedValues = useMemo(() => {
        if (inputMode === 'portion' && labelPortionSize > 0) {
            const factor = 100 / labelPortionSize;
            return {
                protein: protein ? ((parseFloat(protein) || 0) * factor).toFixed(2) : '',
                carbs: carbs ? ((parseFloat(carbs) || 0) * factor).toFixed(2) : '',
                fat: fat ? ((parseFloat(fat) || 0) * factor).toFixed(2) : '',
                calories: calories ? ((parseFloat(calories) || 0) * factor).toFixed(2) : ''
            };
        }
        return null;
    }, [inputMode, labelPortionSize, protein, carbs, fat, calories]);

    // Recalculate values when switching between modes
    useEffect(() => {
        if (inputMode !== prevInputMode && labelPortionSize > 0) {
            const portionSize = parseFloat(labelPortionSize) || 100;
            
            if (prevInputMode === '100g' && inputMode === 'portion') {
                // Switching from 100g to portion: calculate portion values
                const factor = portionSize / 100;
                if (protein) setProtein(((parseFloat(protein) || 0) * factor).toFixed(2));
                if (carbs) setCarbs(((parseFloat(carbs) || 0) * factor).toFixed(2));
                if (fat) setFat(((parseFloat(fat) || 0) * factor).toFixed(2));
                if (calories) setCalories(((parseFloat(calories) || 0) * factor).toFixed(2));
                if (fiber) setFiber(((parseFloat(fiber) || 0) * factor).toFixed(2));
                if (sodium) setSodium(((parseFloat(sodium) || 0) * factor).toFixed(0));
                if (sugar) setSugar(((parseFloat(sugar) || 0) * factor).toFixed(2));
                if (saturatedFat) setSaturatedFat(((parseFloat(saturatedFat) || 0) * factor).toFixed(2));
                if (transFat) setTransFat(((parseFloat(transFat) || 0) * factor).toFixed(2));
                if (monounsaturatedFat) setMonounsaturatedFat(((parseFloat(monounsaturatedFat) || 0) * factor).toFixed(2));
                if (polyunsaturatedFat) setPolyunsaturatedFat(((parseFloat(polyunsaturatedFat) || 0) * factor).toFixed(2));
                if (cholesterol) setCholesterol(((parseFloat(cholesterol) || 0) * factor).toFixed(0));
                // Micronutrients (already in mg, so same factor)
                if (calcium) setCalcium(((parseFloat(calcium) || 0) * factor).toFixed(0));
                if (iron) setIron(((parseFloat(iron) || 0) * factor).toFixed(0));
                if (magnesium) setMagnesium(((parseFloat(magnesium) || 0) * factor).toFixed(0));
                if (phosphorus) setPhosphorus(((parseFloat(phosphorus) || 0) * factor).toFixed(0));
                if (potassium) setPotassium(((parseFloat(potassium) || 0) * factor).toFixed(0));
                if (zinc) setZinc(((parseFloat(zinc) || 0) * factor).toFixed(0));
                if (vitaminA) setVitaminA(((parseFloat(vitaminA) || 0) * factor).toFixed(0));
                if (vitaminC) setVitaminC(((parseFloat(vitaminC) || 0) * factor).toFixed(0));
                if (vitaminD) setVitaminD(((parseFloat(vitaminD) || 0) * factor).toFixed(0));
                if (vitaminE) setVitaminE(((parseFloat(vitaminE) || 0) * factor).toFixed(0));
                if (vitaminB12) setVitaminB12(((parseFloat(vitaminB12) || 0) * factor).toFixed(0));
                if (folate) setFolate(((parseFloat(folate) || 0) * factor).toFixed(0));
            } else if (prevInputMode === 'portion' && inputMode === '100g') {
                // Switching from portion to 100g: normalize to 100g
                const factor = 100 / portionSize;
                if (protein) setProtein(((parseFloat(protein) || 0) * factor).toFixed(2));
                if (carbs) setCarbs(((parseFloat(carbs) || 0) * factor).toFixed(2));
                if (fat) setFat(((parseFloat(fat) || 0) * factor).toFixed(2));
                if (calories) setCalories(((parseFloat(calories) || 0) * factor).toFixed(2));
                if (fiber) setFiber(((parseFloat(fiber) || 0) * factor).toFixed(2));
                if (sodium) setSodium(((parseFloat(sodium) || 0) * factor).toFixed(0));
                if (sugar) setSugar(((parseFloat(sugar) || 0) * factor).toFixed(2));
                if (saturatedFat) setSaturatedFat(((parseFloat(saturatedFat) || 0) * factor).toFixed(2));
                if (transFat) setTransFat(((parseFloat(transFat) || 0) * factor).toFixed(2));
                if (monounsaturatedFat) setMonounsaturatedFat(((parseFloat(monounsaturatedFat) || 0) * factor).toFixed(2));
                if (polyunsaturatedFat) setPolyunsaturatedFat(((parseFloat(polyunsaturatedFat) || 0) * factor).toFixed(2));
                if (cholesterol) setCholesterol(((parseFloat(cholesterol) || 0) * factor).toFixed(0));
                // Micronutrients
                if (calcium) setCalcium(((parseFloat(calcium) || 0) * factor).toFixed(0));
                if (iron) setIron(((parseFloat(iron) || 0) * factor).toFixed(0));
                if (magnesium) setMagnesium(((parseFloat(magnesium) || 0) * factor).toFixed(0));
                if (phosphorus) setPhosphorus(((parseFloat(phosphorus) || 0) * factor).toFixed(0));
                if (potassium) setPotassium(((parseFloat(potassium) || 0) * factor).toFixed(0));
                if (zinc) setZinc(((parseFloat(zinc) || 0) * factor).toFixed(0));
                if (vitaminA) setVitaminA(((parseFloat(vitaminA) || 0) * factor).toFixed(0));
                if (vitaminC) setVitaminC(((parseFloat(vitaminC) || 0) * factor).toFixed(0));
                if (vitaminD) setVitaminD(((parseFloat(vitaminD) || 0) * factor).toFixed(0));
                if (vitaminE) setVitaminE(((parseFloat(vitaminE) || 0) * factor).toFixed(0));
                if (vitaminB12) setVitaminB12(((parseFloat(vitaminB12) || 0) * factor).toFixed(0));
                if (folate) setFolate(((parseFloat(folate) || 0) * factor).toFixed(0));
            }
            
            setPrevInputMode(inputMode);
        }
    }, [inputMode, prevInputMode, labelPortionSize]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-calculate calories
    useEffect(() => {
        if (autoCalcCalories && protein && carbs && fat) {
            let proteinVal = parseFloat(protein) || 0;
            let carbsVal = parseFloat(carbs) || 0;
            let fatVal = parseFloat(fat) || 0;
            const calculated = (proteinVal * 4) + (carbsVal * 4) + (fatVal * 9);
            setCalories(Math.round(calculated * 100) / 100);
        }
    }, [protein, carbs, fat, autoCalcCalories, inputMode, labelPortionSize]);
            
    // Helper function to normalize a value
    const normalizeValue = (value) => {
        if (!value) return null;
            if (inputMode === 'portion' && labelPortionSize > 0) {
                const factor = 100 / labelPortionSize;
            return parseFloat(value) * factor;
        }
        return parseFloat(value);
    };

    // Validation for each step
    const validateStep = (step) => {
        switch (step) {
            case 1: // Básico
                return name.trim().length > 0;
            case 2: // Macronutrientes
                return name.trim().length > 0 && protein && carbs && fat && calories;
            case 3: // Gorduras Detalhadas (opcional)
            case 4: // Micronutrientes (opcional)
            case 5: // Medidas (opcional)
                return true; // All optional
            default:
                return false;
        }
    };

    // Navigation
    const nextStep = () => {
        if (currentStep < totalSteps) {
            if (validateStep(currentStep)) {
                setCurrentStep(currentStep + 1);
            } else {
                toast({
                    title: 'Campos obrigatórios',
                    description: 'Preencha todos os campos obrigatórios antes de continuar.',
                    variant: 'destructive'
                });
            }
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const goToStep = (step) => {
        if (step >= 1 && step <= totalSteps) {
            // Allow going back to any step, but validate when going forward
            if (step > currentStep && !validateStep(currentStep)) {
                toast({
                    title: 'Campos obrigatórios',
                    description: 'Preencha todos os campos obrigatórios antes de continuar.',
                    variant: 'destructive'
                });
                return;
            }
            setCurrentStep(step);
        }
    };

    // Pre-defined common household measures
    const commonMeasures = [
        { label: 'Colher de Sopa', grams: 15 },
        { label: 'Colher de Chá', grams: 5 },
        { label: 'Xícara', grams: 200 },
        { label: 'Unidade', grams: 1 },
        { label: 'Fatia', grams: 30 },
        { label: 'Colher de Servir', grams: 20 }
    ];

    const handleAddMeasure = (measure) => {
        const exists = householdMeasures.some(m => m.label === measure.label);
        if (exists) {
            toast({
                title: 'Medida já adicionada',
                description: `${measure.label} já está na lista.`,
                variant: 'default'
            });
            return;
        }
        setHouseholdMeasures([...householdMeasures, measure]);
    };

    const handleRemoveMeasure = (index) => {
        setHouseholdMeasures(householdMeasures.filter((_, i) => i !== index));
    };

    // Fill form with OpenFoodFacts data
    // IMPORTANTE: O Nello sempre trabalha com base 100g no banco de dados
    // Se o OpenFoodFacts tiver dados de porção, normalizamos para 100g primeiro
    const fillFormWithProduct = (inputProduct) => {
        const product = normalizeExternalProduct(inputProduct);
        // Missing values must stay unknown, never inherit another product's nutrients.
        [setProtein,setCarbs,setFat,setCalories,setFiber,setSugar,setSaturatedFat,setTransFat,
         setMonounsaturatedFat,setPolyunsaturatedFat,setCholesterol,setSodium,setCalcium,setIron,
         setMagnesium,setPhosphorus,setPotassium,setZinc,setVitaminA,setVitaminC,setVitaminD,
         setVitaminE,setVitaminB12,setFolate].forEach(set => set(''));
        setBrand('');setHouseholdMeasures([]);setAutoCalcCalories(false);setReviewedFingerprint(null);

        const nutriments = product.nutriments || {};

        if (product.product_name) setName(product.product_name);
        if (product.brands) setBrand(product.brands.split(',')[0].trim());

        // Detectar tamanho da porção (em gramas) - pode estar em vários lugares
        let servingSize = null;
        if (nutriments.serving_size !== undefined && nutriments.serving_size > 0) {
            servingSize = nutriments.serving_size;
        } else if (product.serving_size !== undefined && product.serving_size > 0) {
            servingSize = product.serving_size;
        } else if (product.serving_quantity !== undefined && product.serving_quantity_unit === 'g' && product.serving_quantity > 0) {
            servingSize = product.serving_quantity;
        }

        // Verificar se há valores de porção disponíveis
        const hasServingValues = nutriments.proteins_serving !== undefined || 
                                 nutriments.carbohydrates_serving !== undefined ||
                                 nutriments.fat_serving !== undefined ||
                                 nutriments.energy_kcal_serving !== undefined;

        // SEMPRE normalizar para 100g (padrão do Nello)
        // Se tiver dados de porção, normalizar os valores da porção para 100g
        // Se não tiver dados de porção, usar diretamente os valores por 100g

        // Proteína
        if (hasServingValues && servingSize && nutriments.proteins_serving !== undefined) {
            // Normalizar valor da porção para 100g
            const factor = 100 / servingSize;
            setProtein((nutriments.proteins_serving * factor).toFixed(2));
        } else if (nutriments.proteins_100g !== undefined) {
                setProtein(nutriments.proteins_100g.toString());
            }

        // Carboidratos
        if (hasServingValues && servingSize && nutriments.carbohydrates_serving !== undefined) {
            const factor = 100 / servingSize;
            setCarbs((nutriments.carbohydrates_serving * factor).toFixed(2));
        } else if (nutriments.carbohydrates_100g !== undefined) {
                setCarbs(nutriments.carbohydrates_100g.toString());
            }

        // Gorduras
        if (hasServingValues && servingSize && nutriments.fat_serving !== undefined) {
            const factor = 100 / servingSize;
            setFat((nutriments.fat_serving * factor).toFixed(2));
        } else if (nutriments.fat_100g !== undefined) {
                setFat(nutriments.fat_100g.toString());
            }

        // Calorias
        if (hasServingValues && servingSize && nutriments.energy_kcal_serving !== undefined) {
            const factor = 100 / servingSize;
            setCalories((nutriments.energy_kcal_serving * factor).toFixed(2));
            setAutoCalcCalories(false);
        } else if (hasServingValues && servingSize && nutriments.energy_serving !== undefined) {
            const factor = 100 / servingSize;
            const kcal = (nutriments.energy_serving * factor) / 4.184;
            setCalories(kcal.toFixed(2));
            setAutoCalcCalories(false);
        } else if (nutriments.energy_kcal_100g !== undefined) {
                setCalories(nutriments.energy_kcal_100g.toString());
            setAutoCalcCalories(false);
            } else if (nutriments.energy_100g !== undefined) {
                const kcal = nutriments.energy_100g / 4.184;
                setCalories(kcal.toFixed(2));
                setAutoCalcCalories(false);
            }

        // Fibra
        if (hasServingValues && servingSize && nutriments.fiber_serving !== undefined) {
            const factor = 100 / servingSize;
            setFiber((nutriments.fiber_serving * factor).toFixed(2));
        } else if (nutriments.fiber_100g !== undefined) {
            setFiber(nutriments.fiber_100g.toString());
        }

        // Sódio (em mg)
        if (hasServingValues && servingSize && nutriments.sodium_serving !== undefined) {
            const factor = 100 / servingSize;
            setSodium((nutriments.sodium_serving * factor * 1000).toFixed(0));
        } else if (nutriments.sodium_100g !== undefined) {
            setSodium((nutriments.sodium_100g * 1000).toString());
        }

        // Açúcares
        if (hasServingValues && servingSize && nutriments.sugars_serving !== undefined) {
            const factor = 100 / servingSize;
            setSugar((nutriments.sugars_serving * factor).toFixed(2));
        } else if (nutriments.sugars_100g !== undefined) {
            setSugar(nutriments.sugars_100g.toString());
        }

        // Gordura saturada
        if (hasServingValues && servingSize && nutriments.saturated_fat_serving !== undefined) {
            const factor = 100 / servingSize;
            setSaturatedFat((nutriments.saturated_fat_serving * factor).toFixed(2));
        } else if (nutriments.saturated_fat_100g !== undefined) {
            setSaturatedFat(nutriments.saturated_fat_100g.toString());
        }

        // Gordura trans
        if (hasServingValues && servingSize && nutriments.trans_fat_serving !== undefined) {
            const factor = 100 / servingSize;
            setTransFat((nutriments.trans_fat_serving * factor).toFixed(2));
        } else if (nutriments.trans_fat_100g !== undefined) {
            setTransFat(nutriments.trans_fat_100g.toString());
        }

        // Gordura monoinsaturada
        if (hasServingValues && servingSize && nutriments.monounsaturated_fat_serving !== undefined) {
            const factor = 100 / servingSize;
            setMonounsaturatedFat((nutriments.monounsaturated_fat_serving * factor).toFixed(2));
        } else if (nutriments.monounsaturated_fat_100g !== undefined) {
            setMonounsaturatedFat(nutriments.monounsaturated_fat_100g.toString());
        }

        // Gordura poliinsaturada
        if (hasServingValues && servingSize && nutriments.polyunsaturated_fat_serving !== undefined) {
            const factor = 100 / servingSize;
            setPolyunsaturatedFat((nutriments.polyunsaturated_fat_serving * factor).toFixed(2));
        } else if (nutriments.polyunsaturated_fat_100g !== undefined) {
            setPolyunsaturatedFat(nutriments.polyunsaturated_fat_100g.toString());
        }

        // Colesterol (em mg)
        if (hasServingValues && servingSize && nutriments.cholesterol_serving !== undefined) {
            const factor = 100 / servingSize;
            setCholesterol((nutriments.cholesterol_serving * factor).toFixed(0));
        } else if (nutriments.cholesterol_100g !== undefined) {
            setCholesterol((nutriments.cholesterol_100g * 1000).toFixed(0));
        }

        // OpenFoodFacts normaliza micronutrientes em gramas. O banco usa mg
        // para minerais, vitaminas C/E e µg para A/D/B12/folato.
        if (hasServingValues && servingSize && nutriments.calcium_serving !== undefined) {
            const factor = 100 / servingSize;
            setCalcium((nutriments.calcium_serving * factor * 1000).toFixed(0));
        } else if (nutriments.calcium_100g !== undefined) {
            setCalcium((nutriments.calcium_100g * 1000).toString());
        }

        if (hasServingValues && servingSize && nutriments.iron_serving !== undefined) {
            const factor = 100 / servingSize;
            setIron((nutriments.iron_serving * factor * 1000).toFixed(0));
        } else if (nutriments.iron_100g !== undefined) {
            setIron((nutriments.iron_100g * 1000).toString());
        }

        if (hasServingValues && servingSize && nutriments.vitamin_c_serving !== undefined) {
            const factor = 100 / servingSize;
            setVitaminC((nutriments.vitamin_c_serving * factor * 1000).toFixed(2));
        } else if (nutriments.vitamin_c_100g !== undefined) {
            setVitaminC((nutriments.vitamin_c_100g * 1000).toString());
        }

        if (hasServingValues && servingSize && nutriments.vitamin_a_serving !== undefined) {
            const factor = 100 / servingSize;
            setVitaminA((nutriments.vitamin_a_serving * factor * 1000000).toFixed(2));
        } else if (nutriments.vitamin_a_100g !== undefined) {
            setVitaminA((nutriments.vitamin_a_100g * 1000000).toString());
        }

        if (hasServingValues && servingSize && nutriments.vitamin_d_serving !== undefined) {
            const factor = 100 / servingSize;
            setVitaminD((nutriments.vitamin_d_serving * factor * 1000000).toFixed(2));
        } else if (nutriments.vitamin_d_100g !== undefined) {
            setVitaminD((nutriments.vitamin_d_100g * 1000000).toString());
        }

        if (hasServingValues && servingSize && nutriments.vitamin_e_serving !== undefined) {
            const factor = 100 / servingSize;
            setVitaminE((nutriments.vitamin_e_serving * factor * 1000).toFixed(2));
        } else if (nutriments.vitamin_e_100g !== undefined) {
            setVitaminE((nutriments.vitamin_e_100g * 1000).toString());
        }

        if (hasServingValues && servingSize && nutriments.vitamin_b12_serving !== undefined) {
            const factor = 100 / servingSize;
            setVitaminB12((nutriments.vitamin_b12_serving * factor * 1000000).toFixed(2));
        } else if (nutriments.vitamin_b12_100g !== undefined) {
            setVitaminB12((nutriments.vitamin_b12_100g * 1000000).toString());
        }

        if (hasServingValues && servingSize && nutriments.folate_serving !== undefined) {
            const factor = 100 / servingSize;
            setFolate((nutriments.folate_serving * factor * 1000000).toFixed(2));
        } else if (nutriments.folate_100g !== undefined) {
            setFolate((nutriments.folate_100g * 1000000).toString());
        }

        if (hasServingValues && servingSize && nutriments.magnesium_serving !== undefined) {
            const factor = 100 / servingSize;
            setMagnesium((nutriments.magnesium_serving * factor * 1000).toFixed(0));
        } else if (nutriments.magnesium_100g !== undefined) {
            setMagnesium((nutriments.magnesium_100g * 1000).toString());
        }

        if (hasServingValues && servingSize && nutriments.phosphorus_serving !== undefined) {
            const factor = 100 / servingSize;
            setPhosphorus((nutriments.phosphorus_serving * factor * 1000).toFixed(0));
        } else if (nutriments.phosphorus_100g !== undefined) {
            setPhosphorus((nutriments.phosphorus_100g * 1000).toString());
        }

        if (hasServingValues && servingSize && nutriments.potassium_serving !== undefined) {
            const factor = 100 / servingSize;
            setPotassium((nutriments.potassium_serving * factor * 1000).toFixed(0));
        } else if (nutriments.potassium_100g !== undefined) {
            setPotassium((nutriments.potassium_100g * 1000).toString());
        }

        if (hasServingValues && servingSize && nutriments.zinc_serving !== undefined) {
            const factor = 100 / servingSize;
            setZinc((nutriments.zinc_serving * factor * 1000).toFixed(0));
        } else if (nutriments.zinc_100g !== undefined) {
            setZinc((nutriments.zinc_100g * 1000).toString());
        }

        // SEMPRE iniciar no modo 100g (padrão do Nello)
        // Se tiver tamanho de porção detectado, salvar para uso futuro
            setInputMode('100g');
        setPrevInputMode('100g');
        
        // Se detectou tamanho de porção, salvar para quando o usuário mudar para modo "portion"
        if (servingSize && servingSize > 0 && servingSize !== 100) {
            setLabelPortionSize(servingSize);
        } else {
            setLabelPortionSize(100);
        }
    };

    // Check if query is a barcode (only numbers, 8-13 digits)
    const isBarcode = (query) => {
        const cleaned = query.trim().replace(/\s/g, '');
        return /^\d{8,13}$/.test(cleaned);
    };

    // Unified search handler
    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            toast({
                title: 'Erro',
                description: 'Digite um código de barras ou nome do produto.',
                variant: 'destructive'
            });
            return;
        }

        const query = searchQuery.trim();

        // If it's a barcode, search directly (Barcodes are usually OFF)
        if (isBarcode(query)) {
            setSearchLoading(true);
            try {
                const { data, error } = await supabase.functions.invoke('openfoodfacts-proxy', {
                    body: { action: 'product', productCode: query }
                });

                if (error || !data || !data.data) {
                    toast({
                        title: error?.context?.status === 429 ? 'Muitas buscas em pouco tempo' : 'Produto não encontrado',
                        description: error?.context?.status === 429 ? 'Aguarde até um minuto e tente novamente.' : 'Busca externa indisponível ou sem resultado. Use o catálogo local ou preencha manualmente a partir do rótulo.',
                        variant: error?.context?.status === 429 ? 'destructive' : 'default'
                    });
                    return;
                }

                const mappedProduct = data.source === 'fatsecret' 
                    ? mapFatSecretToOFF(data.data) 
                    : data.data; // OFF data matches internal structure mostly

                setExternalProvenance({ source: data.source, product_id: String(data.product_id || query),
                    fetched_at: data.fetched_at || new Date().toISOString(), source_updated_at: data.source_updated_at || null, basis: '100g' });
                fillFormWithProduct(mappedProduct);
                setSearchQuery('');

                toast({
                    title: 'Produto encontrado!',
                    description: `Encontrado via ${data.source === 'fatsecret' ? 'FatSecret' : 'OpenFoodFacts'}.`,
                });
            } catch (error) {
                logDiagnostic('error', 'components/nutrition/SmartFoodForm.jsx:609', 'Erro ao buscar produto:', error);
                toast({
                    title: 'Erro',
                    description: error?.message?.startsWith('A fonte não informa') ? error.message : 'Não foi possível consultar a fonte externa. Use o catálogo interno ou preencha os dados do rótulo.',
                    variant: 'destructive'
                });
            } finally {
                setSearchLoading(false);
            }
        } else {
            // If it's a name, search and show results
            if (query.length < 3) {
                toast({
                    title: 'Erro',
                    description: 'Digite pelo menos 3 caracteres para buscar por nome.',
                    variant: 'destructive'
                });
                return;
            }

            setSearchLoading(true);
            try {
                const { data, error } = await supabase.functions.invoke('openfoodfacts-proxy', {
                    body: { action: 'search', query }
                });

                if (error) {
                    toast({
                        title: error?.context?.status === 429 ? 'Muitas buscas em pouco tempo' : 'Erro na busca',
                        description: error?.context?.status === 429 ? 'Aguarde até um minuto e tente novamente.' : 'Não foi possível realizar a busca na base de dados.',
                        variant: 'destructive'
                    });
                    return;
                }

                if (!data.results || data.results.length === 0) {
                    toast({
                        title: 'Nenhum produto encontrado',
                        description: 'Não foi possível encontrar produtos com este nome.',
                        variant: 'default'
                    });
                    return;
                }

                // Map results for the UI
                const validProducts = data.results.map(f => ({
                    code: f.id,
                    product_name: f.name,
                    brands: f.brand || 'Marca desconhecida',
                    image_url: f.image,
                    source: f.source
                }));

                setSearchResults(validProducts);
                setShowResultsDialog(true);
            } catch (error) {
                logDiagnostic('error', 'components/nutrition/SmartFoodForm.jsx:665', 'Erro ao buscar produtos:', error);
                toast({
                    title: 'Erro',
                    description: 'Não foi possível buscar produtos. Verifique sua conexão.',
                    variant: 'destructive'
                });
            } finally {
                setSearchLoading(false);
            }
        }
    };

    // Auxiliar para mapear FatSecret para o formato interno do SmartFoodForm
    // Handle product selection from results
    const handleSelectProduct = async (productCode) => {
        setSearchLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('openfoodfacts-proxy', {
                body: { action: 'product', productCode }
            });

            if (error || !data || !data.data) {
                toast({
                    title: error?.context?.status === 429 ? 'Muitas buscas em pouco tempo' : 'Erro',
                    description: error?.context?.status === 429 ? 'Aguarde até um minuto e tente novamente.' : 'Busca externa indisponível ou sem resultado. Use o catálogo local ou preencha manualmente a partir do rótulo.',
                    variant: 'destructive'
                });
                return;
            }

            const mappedProduct = data.source === 'fatsecret' 
                ? mapFatSecretToOFF(data.data) 
                : data.data;

            setExternalProvenance({ source: data.source, product_id: String(data.product_id || productCode),
                fetched_at: data.fetched_at || new Date().toISOString(), source_updated_at: data.source_updated_at || null, basis: '100g' });
            fillFormWithProduct(mappedProduct);
            setSearchQuery('');
            setShowResultsDialog(false);
            setSearchResults([]);

            toast({
                title: 'Produto selecionado!',
                description: `Carregado via ${data.source === 'fatsecret' ? 'FatSecret' : 'OpenFoodFacts'}.`,
            });
        } catch (error) {
            logDiagnostic('error', 'components/nutrition/SmartFoodForm.jsx:748', 'Erro ao carregar produto:', error);
            toast({
                title: 'Erro',
                description: error?.message?.startsWith('A fonte não informa') ? error.message : 'Não foi possível consultar a fonte externa. Use o catálogo interno ou preencha os dados do rótulo.',
                variant: 'destructive'
            });
        } finally {
            setSearchLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (loading) return;
        if (initialData && foodRevision === null) {
            toast({ title:'Aguarde', description:'A versão do alimento ainda não foi confirmada. Reabra o formulário se a conexão falhou.',variant:'destructive' });return;
        }
        if (externalProvenance && !externalReviewed) {
            toast({title:'Revisão necessária',description:'Confira os valores por 100 g e confirme a revisão antes de incorporar o alimento externo.',variant:'destructive'});return;
        }
        if (!validateStep(2)) {
            toast({
                title: 'Erro',
                description: 'Preencha todos os campos obrigatórios (Nome, Proteína, Carboidratos, Gorduras, Calorias).',
                variant: 'destructive'
            });
            return;
        }

        if (inputMode === 'portion' && (!labelPortionSize || parseFloat(labelPortionSize) <= 0)) {
            toast({
                title: 'Erro',
                description: 'Informe o tamanho da porção do rótulo.',
                variant: 'destructive'
            });
            return;
        }

        setLoading(true);
        try {
            const normalize = (val) => val ? normalizeValue(val) : null;
            
            const foodData = {
                name: name.trim(),
                description: brand.trim() ? `Marca: ${brand.trim()}` : null,
                calories: Math.round(normalize(calories) * 100) / 100,
                protein: Math.round(normalize(protein) * 100) / 100,
                carbs: Math.round(normalize(carbs) * 100) / 100,
                fat: Math.round(normalize(fat) * 100) / 100,
                fiber: normalize(fiber),
                sodium: normalize(sodium),
                sugar: normalize(sugar),
                saturated_fat: normalize(saturatedFat),
                trans_fat: normalize(transFat),
                monounsaturated_fat: normalize(monounsaturatedFat),
                polyunsaturated_fat: normalize(polyunsaturatedFat),
                cholesterol: normalize(cholesterol),
                calcium: normalize(calcium),
                iron: normalize(iron),
                magnesium: normalize(magnesium),
                phosphorus: normalize(phosphorus),
                potassium: normalize(potassium),
                zinc: normalize(zinc),
                vitamin_a: normalize(vitaminA),
                vitamin_c: normalize(vitaminC),
                vitamin_d: normalize(vitaminD),
                vitamin_e: normalize(vitaminE),
                vitamin_b12: normalize(vitaminB12),
                folate: normalize(folate),
                portion_size: 100,
                source: 'custom',
                nutritionist_id: user?.id || null,
                group: 'Personalizado',
                is_active: true
            };

            if (initialData && !['custom', 'CUSTOM'].includes(initialData.source)) {
                throw new Error('Apenas alimentos personalizados podem ser editados');
            }
            const foodPayload = {
                name: foodData.name, brand: foodData.description, base_qty: 100, base_unit: 'g',
                energy_kcal: foodData.calories, protein_g: foodData.protein,
                carbohydrate_g: foodData.carbs, lipid_g: foodData.fat,
                fiber_g: foodData.fiber, sodium_mg: foodData.sodium,
                sugar_g: foodData.sugar, saturated_fat_g: foodData.saturated_fat,
                trans_fat_g: foodData.trans_fat, monounsaturated_fat_g: foodData.monounsaturated_fat,
                polyunsaturated_fat_g: foodData.polyunsaturated_fat,
                cholesterol_mg: foodData.cholesterol, calcium_mg: foodData.calcium,
                iron_mg: foodData.iron, magnesium_mg: foodData.magnesium,
                phosphorus_mg: foodData.phosphorus, potassium_mg: foodData.potassium,
                zinc_mg: foodData.zinc, vitamin_a_mcg: foodData.vitamin_a,
                vitamin_c_mg: foodData.vitamin_c, vitamin_d_mcg: foodData.vitamin_d,
                vitamin_e_mg: foodData.vitamin_e, vitamin_b12_mcg: foodData.vitamin_b12,
                folate_mcg: foodData.folate
            };
            // A busca lista apenas parte dos micronutrientes. Preserve os valores
            // existentes que não vieram no alimento carregado para edição.
            if (initialData) {
                const optionalSources = {
                    sugar_g: 'sugar', saturated_fat_g: 'saturated_fat', trans_fat_g: 'trans_fat',
                    monounsaturated_fat_g: 'monounsaturated_fat', polyunsaturated_fat_g: 'polyunsaturated_fat',
                    cholesterol_mg: 'cholesterol', calcium_mg: 'calcium', iron_mg: 'iron',
                    magnesium_mg: 'magnesium', phosphorus_mg: 'phosphorus', potassium_mg: 'potassium',
                    zinc_mg: 'zinc', vitamin_a_mcg: 'vitamin_a', vitamin_c_mg: 'vitamin_c',
                    vitamin_d_mcg: 'vitamin_d', vitamin_e_mg: 'vitamin_e', vitamin_b12_mcg: 'vitamin_b12',
                    folate_mcg: 'folate'
                };
                for (const [column, source] of Object.entries(optionalSources)) {
                    if (foodPayload[column] === null && !Object.prototype.hasOwnProperty.call(initialData, source)) {
                        delete foodPayload[column];
                    }
                }
            }
            const { data, error } = await idempotentRpc('save_reviewed_custom_food', {
                p_provenance: externalProvenance, p_reviewed: externalReviewed, p_expected: foodRevision,
                p_food_id: initialData?.id || null,
                p_food: foodPayload,
                p_measures: householdMeasures.map(measure => ({
                    ...(measure.id ? { id: measure.id } : {}),
                    label: measure.label,
                    grams: Number(measure.grams)
                }))
            });
            if (error) throw error;
            if (!data?.id) throw new Error('O alimento não foi confirmado pelo servidor');
            setFoodRevision(data.revision);
            const createdFood = { ...foodData, id: data.id, source: 'custom' };

            toast({
                title: initialData ? 'Alimento atualizado!' : 'Alimento criado!',
                description: `${name} foi ${initialData ? 'atualizado' : 'adicionado'} ao banco de dados.`,
            });

            if (onSuccess) {
                onSuccess(createdFood);
            }
        } catch (error) {
            logDiagnostic('error', 'components/nutrition/SmartFoodForm.jsx:875', 'Erro ao salvar alimento:', error);
            toast({
                title: 'Erro',
                description: toPortugueseError(error, 'Não foi possível salvar o alimento.'),
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    useImperativeHandle(ref, () => ({
        submit: handleSubmit
    }));

    const isCompact = mode === 'compact';
    const progress = (currentStep / totalSteps) * 100;

    // Step titles
    const stepTitles = [
        'Básico',
        'Macronutrientes',
        'Gorduras Detalhadas',
        'Micronutrientes',
        'Medidas Caseiras'
    ];

    
return {isCompact,externalProvenance,externalReviewed,setReviewedFingerprint,reviewFingerprint,currentStep,totalSteps,stepTitles,progress,name,setName,brand,setBrand,inputMode,setInputMode,labelPortionSize,setLabelPortionSize,normalizedValues,protein,setProtein,carbs,setCarbs,fat,setFat,autoCalcCalories,setAutoCalcCalories,calories,setCalories,fiber,setFiber,sugar,setSugar,saturatedFat,setSaturatedFat,transFat,setTransFat,monounsaturatedFat,setMonounsaturatedFat,polyunsaturatedFat,setPolyunsaturatedFat,cholesterol,setCholesterol,sodium,setSodium,calcium,setCalcium,iron,setIron,magnesium,setMagnesium,phosphorus,setPhosphorus,potassium,setPotassium,zinc,setZinc,vitaminA,setVitaminA,vitaminC,setVitaminC,vitaminD,setVitaminD,vitaminE,setVitaminE,vitaminB12,setVitaminB12,folate,setFolate,commonMeasures,handleAddMeasure,householdMeasures,handleRemoveMeasure,searchQuery,setSearchQuery,searchLoading,handleSearch,showResultsDialog,setShowResultsDialog,searchResults,handleSelectProduct,prevStep,loading,nextStep,handleSubmit};
}
