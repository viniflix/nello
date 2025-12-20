import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Plus, X, Calculator, Barcode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { createFood } from '@/lib/supabase/foodService';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

/**
 * SmartFoodForm - Formulário inteligente para criar/editar alimentos
 * 
 * Features:
 * - Busca por código de barras (OpenFoodFacts)
 * - Auto-cálculo de calorias baseado em macros
 * - Conversão automática de porção do rótulo para 100g
 * - Adição rápida de medidas caseiras comuns
 * 
 * @param {Object} props
 * @param {Object} props.initialData - Dados iniciais (para edição)
 * @param {Function} props.onSuccess - Callback quando alimento é criado/editado
 * @param {string} props.mode - 'compact' | 'full' (layout mode)
 * @param {string} props.initialName - Nome inicial (para quick-add)
 */
const SmartFoodForm = forwardRef(function SmartFoodForm({ 
    initialData = null,
    onSuccess,
    mode = 'full',
    initialName = ''
}, ref) {
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [name, setName] = useState('');
    const [brand, setBrand] = useState('');
    const [inputMode, setInputMode] = useState('100g'); // '100g' | 'portion'
    const [labelPortionSize, setLabelPortionSize] = useState(100); // Tamanho da porção do rótulo
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [calories, setCalories] = useState('');
    const [autoCalcCalories, setAutoCalcCalories] = useState(true);
    const [householdMeasures, setHouseholdMeasures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [barcode, setBarcode] = useState('');
    const [barcodeLoading, setBarcodeLoading] = useState(false);

    // Pre-fill from initialData (for editing) or initialName (for quick-add)
    useEffect(() => {
        if (initialData) {
            // Edit mode: load existing food data
            setName(initialData.name || '');
            setBrand(initialData.description?.replace('Marca: ', '') || '');
            setProtein(initialData.protein?.toString() || '');
            setCarbs(initialData.carbs?.toString() || '');
            setFat(initialData.fat?.toString() || '');
            setCalories(initialData.calories?.toString() || '');
            setAutoCalcCalories(false); // Don't auto-calc when editing
            setInputMode('100g'); // Always 100g when editing (already normalized)
        } else if (initialName) {
            // Quick-add mode: pre-fill name
            setName(initialName);
        }
    }, [initialData, initialName]);

    // Calculate normalized values (for 100g) when in portion mode
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

    // Auto-calculate calories when macros change
    useEffect(() => {
        if (autoCalcCalories && protein && carbs && fat) {
            let proteinVal = parseFloat(protein) || 0;
            let carbsVal = parseFloat(carbs) || 0;
            let fatVal = parseFloat(fat) || 0;
            
            // If in portion mode, calculate calories based on portion values first, then normalize
            if (inputMode === 'portion' && labelPortionSize > 0) {
                // Calculate calories for the portion
                const portionCalories = (proteinVal * 4) + (carbsVal * 4) + (fatVal * 9);
                // Normalize to 100g
                const factor = 100 / labelPortionSize;
                const calculated = portionCalories * factor;
                setCalories(Math.round(calculated * 100) / 100);
            } else {
                // Calories = (Protein * 4) + (Carbs * 4) + (Fat * 9)
                const calculated = (proteinVal * 4) + (carbsVal * 4) + (fatVal * 9);
                setCalories(Math.round(calculated * 100) / 100); // Round to 2 decimals
            }
        }
    }, [protein, carbs, fat, autoCalcCalories, inputMode, labelPortionSize]);

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
        // Check if measure already exists
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

    // Fetch product from OpenFoodFacts API
    const handleFetchBarcode = async () => {
        if (!barcode.trim()) {
            toast({
                title: 'Erro',
                description: 'Digite um código de barras válido.',
                variant: 'destructive'
            });
            return;
        }

        setBarcodeLoading(true);
        try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode.trim()}.json`);
            const data = await response.json();

            if (data.status === 0 || !data.product) {
                toast({
                    title: 'Produto não encontrado',
                    description: 'Não foi possível encontrar este produto no OpenFoodFacts.',
                    variant: 'default'
                });
                return;
            }

            const product = data.product;
            const nutriments = product.nutriments || {};

            // Map OpenFoodFacts data to our fields
            if (product.product_name) {
                setName(product.product_name);
            }
            if (product.brands) {
                setBrand(product.brands.split(',')[0].trim()); // Take first brand
            }
            if (nutriments.proteins_100g !== undefined) {
                setProtein(nutriments.proteins_100g.toString());
            }
            if (nutriments.carbohydrates_100g !== undefined) {
                setCarbs(nutriments.carbohydrates_100g.toString());
            }
            if (nutriments.fat_100g !== undefined) {
                setFat(nutriments.fat_100g.toString());
            }
            if (nutriments.energy_kcal_100g !== undefined) {
                setCalories(nutriments.energy_kcal_100g.toString());
                setAutoCalcCalories(false); // Use API value
            } else if (nutriments.energy_100g !== undefined) {
                // Convert kJ to kcal (1 kcal = 4.184 kJ)
                const kcal = nutriments.energy_100g / 4.184;
                setCalories(kcal.toFixed(2));
                setAutoCalcCalories(false);
            }

            // Set input mode to 100g (OpenFoodFacts provides per 100g)
            setInputMode('100g');
            setLabelPortionSize(100);

            toast({
                title: 'Produto encontrado!',
                description: 'Campos preenchidos automaticamente.',
            });
        } catch (error) {
            console.error('Erro ao buscar produto:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível buscar o produto. Verifique sua conexão.',
                variant: 'destructive'
            });
        } finally {
            setBarcodeLoading(false);
        }
    };

    const handleSubmit = async () => {
        // Validation
        if (!name.trim()) {
            toast({
                title: 'Erro',
                description: 'Nome do alimento é obrigatório.',
                variant: 'destructive'
            });
            return;
        }

        if (!protein || !carbs || !fat || !calories) {
            toast({
                title: 'Erro',
                description: 'Preencha todos os valores nutricionais.',
                variant: 'destructive'
            });
            return;
        }

        // Validate label portion size if in portion mode
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
            // Normalize values to 100g base if in portion mode
            let finalProtein = parseFloat(protein) || 0;
            let finalCarbs = parseFloat(carbs) || 0;
            let finalFat = parseFloat(fat) || 0;
            let finalCalories = parseFloat(calories) || 0;

            if (inputMode === 'portion' && labelPortionSize > 0) {
                const factor = 100 / labelPortionSize;
                finalProtein = (finalProtein * factor);
                finalCarbs = (finalCarbs * factor);
                finalFat = (finalFat * factor);
                finalCalories = (finalCalories * factor);
            }

            // Prepare food data (always stored per 100g)
            const foodData = {
                name: name.trim(),
                description: brand.trim() ? `Marca: ${brand.trim()}` : null,
                calories: Math.round(finalCalories * 100) / 100,
                protein: Math.round(finalProtein * 100) / 100,
                carbs: Math.round(finalCarbs * 100) / 100,
                fat: Math.round(finalFat * 100) / 100,
                portion_size: 100, // Always 100g in DB
                source: 'custom',
                nutritionist_id: user?.id || null,
                group: 'Personalizado',
                is_active: true
            };

            let createdFood;

            if (initialData) {
                // Update existing food
                const { data, error } = await supabase
                    .from('foods')
                    .update(foodData)
                    .eq('id', initialData.id)
                    .select('id, name, group, description, source, calories, protein, carbs, fat, fiber, sodium, portion_size')
                    .single();

                if (error) throw error;
                createdFood = data;
            } else {
                // Create new food
                const { data, error } = await createFood(foodData);
                if (error) throw error;
                if (!data) {
                    throw new Error('Alimento criado mas não retornado');
                }
                createdFood = data;
            }

            // Create household measures (using food_measures table)
            if (householdMeasures.length > 0) {
                // Delete existing measures if editing
                if (initialData) {
                    await supabase
                        .from('food_measures')
                        .delete()
                        .eq('food_id', createdFood.id);
                }

                const measuresToInsert = householdMeasures.map(measure => ({
                    food_id: createdFood.id,
                    measure_label: measure.label,
                    quantity_grams: measure.grams
                }));

                const { error: measuresError } = await supabase
                    .from('food_measures')
                    .insert(measuresToInsert);

                if (measuresError) {
                    console.warn('Erro ao criar medidas caseiras:', measuresError);
                    // Não falhar a criação do alimento se as medidas falharem
                }
            }

            toast({
                title: initialData ? 'Alimento atualizado!' : 'Alimento criado!',
                description: `${name} foi ${initialData ? 'atualizado' : 'adicionado'} ao banco de dados.`,
            });

            // Callback with created/updated food
            if (onSuccess) {
                onSuccess(createdFood);
            }
        } catch (error) {
            console.error('Erro ao salvar alimento:', error);
            toast({
                title: 'Erro',
                description: error.message || 'Não foi possível salvar o alimento.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    // Expose submit function via ref (for compact mode)
    useImperativeHandle(ref, () => ({
        submit: handleSubmit
    }));

    const isCompact = mode === 'compact';

    return (
        <div className={isCompact ? "space-y-3" : "space-y-4"}>
            {/* Barcode Detective Section */}
            {!isCompact && (
                <div className="space-y-2 border-b pb-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                        <Barcode className="h-4 w-4" />
                        Buscar por Código de Barras
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Digite o código EAN (ex: 7891000100103)"
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleFetchBarcode();
                                }
                            }}
                        />
                        <Button
                            onClick={handleFetchBarcode}
                            disabled={barcodeLoading || !barcode.trim()}
                            variant="outline"
                        >
                            {barcodeLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Barcode className="h-4 w-4 mr-2" />
                                    Buscar
                                </>
                            )}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Busca automática de dados nutricionais via OpenFoodFacts
                    </p>
                </div>
            )}

            {/* Basic Info */}
            <div className={`space-y-${isCompact ? '3' : '4'}`}>
                <div className="space-y-2">
                    <Label htmlFor="name">Nome do Alimento *</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Bolo de Chocolate"
                        autoFocus={!initialData}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="brand">Marca (opcional)</Label>
                    <Input
                        id="brand"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        placeholder="Ex: Marca X"
                    />
                </div>
            </div>

            {/* Macros Section */}
            <div className={`${isCompact ? "space-y-3 border-t pt-3" : "space-y-4 border-t pt-4"}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-base font-semibold">Macronutrientes</Label>
                    </div>
                </div>

                {/* Input Mode Tabs */}
                <Tabs value={inputMode} onValueChange={setInputMode} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="100g">Dados por 100g</TabsTrigger>
                        <TabsTrigger value="portion">Dados do Rótulo (Porção)</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="100g" className="space-y-4 mt-4">
                        <p className="text-sm text-muted-foreground">
                            Informe os valores nutricionais por 100g do alimento
                        </p>
                    </TabsContent>
                    
                    <TabsContent value="portion" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="labelPortionSize">Tamanho da Porção do Rótulo (g) *</Label>
                            <Input
                                id="labelPortionSize"
                                type="number"
                                value={labelPortionSize}
                                onChange={(e) => setLabelPortionSize(e.target.value)}
                                placeholder="Ex: 30"
                            />
                            <p className="text-xs text-muted-foreground">
                                Informe o tamanho da porção indicada no rótulo
                            </p>
                        </div>
                        {normalizedValues && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
                                    Equivalente por 100g:
                                </p>
                                <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                                    <p>Proteína: {normalizedValues.protein}g</p>
                                    <p>Carboidratos: {normalizedValues.carbs}g</p>
                                    <p>Gorduras: {normalizedValues.fat}g</p>
                                    {normalizedValues.calories && (
                                        <p>Calorias: {normalizedValues.calories} kcal</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="protein">
                            Proteína (g) *
                            {inputMode === 'portion' && labelPortionSize > 0 && (
                                <span className="text-xs text-muted-foreground block">
                                    por {labelPortionSize}g
                                </span>
                            )}
                        </Label>
                        <Input
                            id="protein"
                            type="number"
                            step="0.1"
                            value={protein}
                            onChange={(e) => setProtein(e.target.value)}
                            placeholder="0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="carbs">
                            Carboidratos (g) *
                            {inputMode === 'portion' && labelPortionSize > 0 && (
                                <span className="text-xs text-muted-foreground block">
                                    por {labelPortionSize}g
                                </span>
                            )}
                        </Label>
                        <Input
                            id="carbs"
                            type="number"
                            step="0.1"
                            value={carbs}
                            onChange={(e) => setCarbs(e.target.value)}
                            placeholder="0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="fat">
                            Gorduras (g) *
                            {inputMode === 'portion' && labelPortionSize > 0 && (
                                <span className="text-xs text-muted-foreground block">
                                    por {labelPortionSize}g
                                </span>
                            )}
                        </Label>
                        <Input
                            id="fat"
                            type="number"
                            step="0.1"
                            value={fat}
                            onChange={(e) => setFat(e.target.value)}
                            placeholder="0"
                        />
                    </div>
                </div>

                {/* Calories */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="calories">Calorias (kcal) *</Label>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="autoCalc"
                                checked={autoCalcCalories}
                                onChange={(e) => setAutoCalcCalories(e.target.checked)}
                                className="w-4 h-4"
                            />
                            <Label htmlFor="autoCalc" className="text-sm font-normal cursor-pointer">
                                Calcular automaticamente
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="calories"
                        type="number"
                        step="0.1"
                        value={calories}
                        onChange={(e) => {
                            setCalories(e.target.value);
                            setAutoCalcCalories(false);
                        }}
                        placeholder="0"
                        disabled={autoCalcCalories}
                        className={autoCalcCalories ? 'bg-muted' : ''}
                    />
                    {autoCalcCalories && (
                        <p className="text-xs text-muted-foreground">
                            Cálculo: (Proteína × 4) + (Carboidratos × 4) + (Gorduras × 9)
                        </p>
                    )}
                </div>
            </div>

            {/* Household Measures Section */}
            <div className={`space-y-${isCompact ? '3' : '4'} border-t pt-${isCompact ? '3' : '4'}`}>
                <Label className="text-base font-semibold">Medidas Caseiras Comuns</Label>
                <p className="text-sm text-muted-foreground">
                    Clique nos botões abaixo para adicionar medidas rapidamente
                </p>

                <div className="flex flex-wrap gap-2">
                    {commonMeasures.map((measure, idx) => (
                        <Badge
                            key={idx}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-1"
                            onClick={() => handleAddMeasure(measure)}
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            {measure.label} ({measure.grams}g)
                        </Badge>
                    ))}
                </div>

                {/* Added Measures List */}
                {householdMeasures.length > 0 && (
                    <div className="space-y-2">
                        <Label className="text-sm">Medidas Adicionadas:</Label>
                        <div className="space-y-2">
                            {householdMeasures.map((measure, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-2 border rounded-lg bg-muted/30"
                                >
                                    <span className="text-sm">
                                        {measure.label} - {measure.grams}g
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveMeasure(idx)}
                                        className="h-6 w-6 p-0"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Submit Button (only in full mode, compact mode handles it externally) */}
            {!isCompact && (
                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {initialData ? 'Atualizando...' : 'Criando...'}
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                {initialData ? 'Atualizar Alimento' : 'Criar Alimento'}
                            </>
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
});

export default SmartFoodForm;

