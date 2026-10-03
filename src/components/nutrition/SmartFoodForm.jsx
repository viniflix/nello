import {useSmartFoodFormController} from './useSmartFoodFormController';
import { mapFatSecretToOFF, normalizeExternalProduct } from '@/lib/utils/externalFood';
import { idempotentRpc } from '@/lib/supabase/idempotent-mutations';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Plus, X, Calculator, Barcode, Loader2, Info, ChevronRight, ChevronLeft, Search, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { toPortugueseError } from '@/lib/utils/errorMessages';

/**
 * SmartFoodForm - Formulário inteligente passo a passo para criar/editar alimentos
 *
 * Features:
 * - Wizard passo a passo (5 etapas)
 * - Busca por código de barras ou nome (OpenFoodFacts)
 * - Auto-cálculo de calorias baseado em macros
 * - Conversão automática de porção do rótulo para 100g
 * - Suporte completo a micronutrientes
 * - Opção de pular etapas opcionais
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
const {isCompact,externalProvenance,externalReviewed,setReviewedFingerprint,reviewFingerprint,currentStep,totalSteps,stepTitles,progress,name,setName,brand,setBrand,inputMode,setInputMode,labelPortionSize,setLabelPortionSize,normalizedValues,protein,setProtein,carbs,setCarbs,fat,setFat,autoCalcCalories,setAutoCalcCalories,calories,setCalories,fiber,setFiber,sugar,setSugar,saturatedFat,setSaturatedFat,transFat,setTransFat,monounsaturatedFat,setMonounsaturatedFat,polyunsaturatedFat,setPolyunsaturatedFat,cholesterol,setCholesterol,sodium,setSodium,calcium,setCalcium,iron,setIron,magnesium,setMagnesium,phosphorus,setPhosphorus,potassium,setPotassium,zinc,setZinc,vitaminA,setVitaminA,vitaminC,setVitaminC,vitaminD,setVitaminD,vitaminE,setVitaminE,vitaminB12,setVitaminB12,folate,setFolate,commonMeasures,handleAddMeasure,householdMeasures,handleRemoveMeasure,searchQuery,setSearchQuery,searchLoading,handleSearch,showResultsDialog,setShowResultsDialog,searchResults,handleSelectProduct,prevStep,loading,nextStep,handleSubmit}=useSmartFoodFormController({initialData:initialData,onSuccess:onSuccess,mode:mode,initialName:initialName},ref);
return (
        <div className={isCompact ? "space-y-3" : "space-y-6"}>
            {externalProvenance && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-stone-800">
                <p>Fonte: {externalProvenance.source === 'fatsecret' ? 'FatSecret' : 'Open Food Facts'} · Consulta: {new Date(externalProvenance.fetched_at).toLocaleString('pt-BR')} · Valores por 100 g.</p>
                <p className="mt-1">Campos ausentes continuam desconhecidos. Confira o rótulo, unidades e valores antes de salvar. Alterações exigem uma nova confirmação.</p>
                <label className="mt-3 flex items-start gap-2">
                    <input type="checkbox" checked={externalReviewed} onChange={event => setReviewedFingerprint(event.target.checked ? reviewFingerprint : null)} className="mt-1 accent-primary" />
                    Revisei os dados nutricionais e confirmo sua incorporação ao meu catálogo.
                </label>
            </div>}
            {/* Progress Bar - Always show in full mode */}
            {mode !== 'compact' && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">
                                    Passo {currentStep} de {totalSteps}: {stepTitles[currentStep - 1]}
                                </span>
                                <span className="text-muted-foreground">{Math.round(progress)}%</span>
                    </div>
                            <Progress value={progress} className="h-2" />
                </div>
                    </CardContent>
                </Card>
            )}

            {/* Step Content - Show first */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        {currentStep === 1 && '1/5 - Informações Básicas'}
                        {currentStep === 2 && '2/5 - Macronutrientes'}
                        {currentStep === 3 && '3/5 - Gorduras Detalhadas e Outros (Opcional)'}
                        {currentStep === 4 && '4/5 - Micronutrientes (Opcional)'}
                        {currentStep === 5 && '5/5 - Medidas Caseiras (Opcional)'}
                    </CardTitle>
                    <CardDescription>
                        {currentStep === 1 && 'Dados essenciais do alimento'}
                        {currentStep === 2 && 'Valores nutricionais principais (opcionais)'}
                        {currentStep === 3 && 'Informações adicionais sobre gorduras e outros componentes'}
                        {currentStep === 4 && 'Vitaminas e minerais do alimento'}
                        {currentStep === 5 && 'Medidas caseiras para facilitar o uso'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* STEP 1: Basic Info */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                <div className="space-y-2">
                                <Label htmlFor="name">
                                    Nome do Alimento <span className="text-destructive">*</span>
                                </Label>
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
                    )}

                    {/* STEP 2: Macronutrients */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Deixe em branco os nutrientes desconhecidos. Eles não serão contabilizados; isso não significa que o alimento não contém esses nutrientes.</p>
                <Tabs value={inputMode} onValueChange={setInputMode} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="100g">Dados por 100g</TabsTrigger>
                        <TabsTrigger value="portion">Dados do Rótulo (Porção)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="100g" className="space-y-4 mt-4">
                                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                        <p className="text-sm text-blue-900 dark:text-blue-100 flex items-center gap-2">
                                            <Info className="h-4 w-4" />
                            Informe os valores nutricionais por 100g do alimento
                        </p>
                                    </div>
                    </TabsContent>

                    <TabsContent value="portion" className="space-y-4 mt-4">
                        <div className="space-y-2">
                                        <Label htmlFor="labelPortionSize">
                                            Tamanho da Porção do Rótulo (g) <span className="text-destructive">*</span>
                                        </Label>
                            <Input
                                id="labelPortionSize"
                                type="number"
                                value={labelPortionSize}
                                onChange={(e) => setLabelPortionSize(e.target.value)}
                                placeholder="Ex: 30"
                            />
                        </div>
                        {normalizedValues && (
                                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                            <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
                                    Equivalente por 100g:
                                </p>
                                            <div className="text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
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

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="protein">
                                        Proteína (g) <span className="text-destructive">*</span>
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
                                        Carboidratos (g) <span className="text-destructive">*</span>
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
                                        Gorduras (g) <span className="text-destructive">*</span>
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

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                                    <Label htmlFor="calories">
                                        Calorias (kcal) <span className="text-destructive">*</span>
                                    </Label>
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
                    )}

                    {/* STEP 3: Additional Macronutrients */}
                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
                                    <Info className="h-4 w-4" />
                                    Esta etapa é opcional. Você pode pular se não tiver essas informações.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fiber">Fibra (g)</Label>
                                    <Input
                                        id="fiber"
                                        type="number"
                                        step="0.1"
                                        value={fiber}
                                        onChange={(e) => setFiber(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sugar">Açúcares (g)</Label>
                                    <Input
                                        id="sugar"
                                        type="number"
                                        step="0.1"
                                        value={sugar}
                                        onChange={(e) => setSugar(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="saturatedFat">Gordura Saturada (g)</Label>
                                    <Input
                                        id="saturatedFat"
                                        type="number"
                                        step="0.1"
                                        value={saturatedFat}
                                        onChange={(e) => setSaturatedFat(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="transFat">Gordura Trans (g)</Label>
                                    <Input
                                        id="transFat"
                                        type="number"
                                        step="0.1"
                                        value={transFat}
                                        onChange={(e) => setTransFat(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="monounsaturatedFat">Gordura Monoinsaturada (g)</Label>
                                    <Input
                                        id="monounsaturatedFat"
                                        type="number"
                                        step="0.1"
                                        value={monounsaturatedFat}
                                        onChange={(e) => setMonounsaturatedFat(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="polyunsaturatedFat">Gordura Poliinsaturada (g)</Label>
                                    <Input
                                        id="polyunsaturatedFat"
                                        type="number"
                                        step="0.1"
                                        value={polyunsaturatedFat}
                                        onChange={(e) => setPolyunsaturatedFat(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="cholesterol">Colesterol (mg)</Label>
                                    <Input
                                        id="cholesterol"
                                        type="number"
                                        step="0.1"
                                        value={cholesterol}
                                        onChange={(e) => setCholesterol(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sodium">Sódio (mg)</Label>
                                    <Input
                                        id="sodium"
                                        type="number"
                                        step="0.1"
                                        value={sodium}
                                        onChange={(e) => setSodium(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: Micronutrients */}
                    {currentStep === 4 && (
                        <div className="space-y-6">
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
                                    <Info className="h-4 w-4" />
                                    Esta etapa é opcional. Você pode pular se não tiver essas informações.
                                </p>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground">Minerais (mg)</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="calcium">Cálcio (mg)</Label>
                                        <Input
                                            id="calcium"
                                            type="number"
                                            step="0.1"
                                            value={calcium}
                                            onChange={(e) => setCalcium(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="iron">Ferro (mg)</Label>
                                        <Input
                                            id="iron"
                                            type="number"
                                            step="0.1"
                                            value={iron}
                                            onChange={(e) => setIron(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="magnesium">Magnésio (mg)</Label>
                                        <Input
                                            id="magnesium"
                                            type="number"
                                            step="0.1"
                                            value={magnesium}
                                            onChange={(e) => setMagnesium(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phosphorus">Fósforo (mg)</Label>
                                        <Input
                                            id="phosphorus"
                                            type="number"
                                            step="0.1"
                                            value={phosphorus}
                                            onChange={(e) => setPhosphorus(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="potassium">Potássio (mg)</Label>
                                        <Input
                                            id="potassium"
                                            type="number"
                                            step="0.1"
                                            value={potassium}
                                            onChange={(e) => setPotassium(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="zinc">Zinco (mg)</Label>
                                        <Input
                                            id="zinc"
                                            type="number"
                                            step="0.1"
                                            value={zinc}
                                            onChange={(e) => setZinc(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground">Vitaminas</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="vitaminA">Vitamina A (µg RAE)</Label>
                                        <Input
                                            id="vitaminA"
                                            type="number"
                                            step="0.1"
                                            value={vitaminA}
                                            onChange={(e) => setVitaminA(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="vitaminC">Vitamina C (mg)</Label>
                                        <Input
                                            id="vitaminC"
                                            type="number"
                                            step="0.1"
                                            value={vitaminC}
                                            onChange={(e) => setVitaminC(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="vitaminD">Vitamina D (µg)</Label>
                                        <Input
                                            id="vitaminD"
                                            type="number"
                                            step="0.1"
                                            value={vitaminD}
                                            onChange={(e) => setVitaminD(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="vitaminE">Vitamina E (mg)</Label>
                                        <Input
                                            id="vitaminE"
                                            type="number"
                                            step="0.1"
                                            value={vitaminE}
                                            onChange={(e) => setVitaminE(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="vitaminB12">Vitamina B12 (µg)</Label>
                                        <Input
                                            id="vitaminB12"
                                            type="number"
                                            step="0.1"
                                            value={vitaminB12}
                                            onChange={(e) => setVitaminB12(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="folate">Folato (µg)</Label>
                                        <Input
                                            id="folate"
                                            type="number"
                                            step="0.1"
                                            value={folate}
                                            onChange={(e) => setFolate(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: Household Measures */}
                    {currentStep === 5 && (
                        <div className="space-y-4">
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
                                    <Info className="h-4 w-4" />
                                    Esta etapa é opcional. Você pode pular se não quiser adicionar medidas caseiras.
                                </p>
                            </div>
                <div className="flex flex-wrap gap-2">
                    {commonMeasures.map((measure, idx) => (
                        <button type="button"
                            key={idx}

                            className="w-full text-left cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-1"
                            onClick={() => handleAddMeasure(measure)}
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            {measure.label} ({measure.grams}g)
                        </button>
                    ))}
                </div>
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
                    )}
                </CardContent>
            </Card>

            {/* Search Section - Only in full mode and step 1, below wizard */}
            {mode !== 'compact' && currentStep === 1 && (
                <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2 text-green-900 dark:text-green-100">
                            <Search className="h-4 w-4" />
                            Buscar no Banco de Alimentos Públicos
                        </CardTitle>
                        <CardDescription className="text-green-800 dark:text-green-200">
                            <p className="mb-1">Busque por código de barras (EAN) ou nome do produto</p>
                            <p className="text-xs mt-1 opacity-75">
                                Utilizamos a plataforma OpenFoodFacts. Os dados podem ter imprecisões e devem ser verificados.
                            </p>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                id="searchQuery"
                                placeholder="Digite o código de barras (ex: 7891000100103) ou nome do produto (ex: Whey Protein)"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !searchLoading) {
                                        handleSearch();
                                    }
                                }}
                                className="flex-1 w-full"
                            />
                            <Button
                                onClick={handleSearch}
                                disabled={searchLoading || !searchQuery.trim()}
                                className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto flex-shrink-0"
                            >
                                {searchLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <Search className="h-4 w-4 mr-2" />
                                        <span className="hidden sm:inline">Buscar</span>
                                        <span className="sm:hidden">Buscar</span>
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-green-700 dark:text-green-300 break-words">
                            💡 Dica: Digite apenas números para buscar por código de barras, ou texto para buscar por nome do produto
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Dialog for Product Selection */}
            <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
                <DialogContent className="max-w-2xl max-h-[90dvh] w-[95vw] sm:w-full p-4 sm:p-6 flex flex-col">
                    <DialogHeader className="pb-3 flex-shrink-0">
                        <DialogTitle className="text-base sm:text-lg">Selecione o Produto</DialogTitle>
                        <DialogDescription className="text-xs sm:text-sm">
                            Encontramos {searchResults.length} produto(s). Selecione o produto correto para preencher os dados automaticamente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 overflow-y-auto pr-2 sm:pr-4">
                        <div className="space-y-2">
                            {searchResults.map((product) => (
                                <Card as="button" type="button"
                                    key={product.code}
                                    className="cursor-pointer hover:bg-muted transition-colors"
                                    onClick={() => handleSelectProduct(product.code)}
                                >
                                    <CardContent className="p-3 sm:p-4">
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            {product.image_url && (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.product_name}
                                                    className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            )}
                                            <div className="flex-1 min-w-0 flex flex-col gap-1 pr-2">
                                                <h4 className="font-semibold text-xs sm:text-sm break-words line-clamp-2 leading-tight">
                                                    {product.product_name || 'Produto sem nome'}
                                                </h4>
                                                {product.brands && (
                                                    <p className="text-xs text-muted-foreground break-words line-clamp-1">
                                                        Marca: {product.brands.split(',')[0].trim()}
                                                    </p>
                                                )}
                                                {product.code && (
                                                    <p className="text-xs text-muted-foreground break-all">
                                                        Código: {product.code}
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectProduct(product.code);
                                                }}
                                                className="flex-shrink-0 self-start whitespace-nowrap"
                                            >
                                                <span className="hidden sm:inline">Selecionar</span>
                                                <span className="sm:hidden">OK</span>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Navigation Buttons - Always show in full mode */}
            {mode !== 'compact' && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-2">
                                {currentStep > 1 && (
                                    <Button
                                        variant="outline"
                                        onClick={prevStep}
                                        disabled={loading}
                                        size="lg"
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-2" />
                                        Anterior
                                    </Button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {(currentStep === 3 || currentStep === 4 || currentStep === 5) && (
                                    <Button
                                        variant="ghost"
                                        onClick={nextStep}
                                        disabled={loading}
                                        size="lg"
                                    >
                                        Pular
                                    </Button>
                                )}
                                {currentStep < totalSteps ? (
                                    <Button
                                        onClick={nextStep}
                                        disabled={loading}
                                        size="lg"
                                    >
                                        Próximo
                                        <ChevronRight className="h-4 w-4 ml-2" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={loading}
                                        size="lg"
                                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {initialData ? 'Atualizando...' : 'Criando...'}
                            </>
                        ) : (
                            <>
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                {initialData ? 'Atualizar Alimento' : 'Criar Alimento'}
                            </>
                        )}
                    </Button>
                                )}
                </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
});

export default SmartFoodForm;
