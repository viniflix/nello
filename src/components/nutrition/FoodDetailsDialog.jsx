import React from 'react';
import { X, Package, Database, Info } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

/**
 * FoodDetailsDialog - Modal completo com todos os dados do alimento
 * 
 * @param {Object} food - Dados completos do alimento
 * @param {boolean} open - Se o dialog está aberto
 * @param {Function} onOpenChange - Callback quando o estado muda
 */
const FoodDetailsDialog = ({ food, open, onOpenChange }) => {
    if (!food) return null;

    const sourceLabels = {
        'TACO': 'TACO - Tabela Brasileira de Composição de Alimentos',
        'IBGE': 'IBGE - Instituto Brasileiro de Geografia e Estatística',
        'USDA': 'USDA - United States Department of Agriculture',
        'Tucunduva': 'Tucunduva',
        'TBCA': 'TBCA - Tabela Brasileira de Composição de Alimentos',
        'custom': 'Personalizado'
    };

    const sourceColors = {
        'TACO': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        'IBGE': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        'USDA': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
        'Tucunduva': 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
        'TBCA': 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
        'custom': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw] sm:w-full p-4 sm:p-6">
                <DialogHeader className="pb-3 sm:pb-4">
                    <DialogTitle className="text-lg sm:text-xl flex items-center gap-2 flex-wrap">
                        <Package className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                        <span className="break-words">{food.name}</span>
                    </DialogTitle>
                    <DialogDescription className="mt-2">
                        {food.group && <span className="block text-xs sm:text-sm">{food.group}</span>}
                        {food.source && (
                            <Badge 
                                variant="outline" 
                                className={`${sourceColors[food.source] || ''} mt-2 text-xs`}
                            >
                                {sourceLabels[food.source] || food.source}
                            </Badge>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[calc(90vh-120px)] sm:max-h-[70vh] pr-2 sm:pr-4">
                    <Tabs defaultValue="macros" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 h-auto p-1 gap-1">
                            <TabsTrigger value="macros" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                                <span className="hidden sm:inline">Macronutrientes</span>
                                <span className="sm:hidden">Macros</span>
                            </TabsTrigger>
                            <TabsTrigger value="micros" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                                <span className="hidden sm:inline">Micronutrientes</span>
                                <span className="sm:hidden">Micros</span>
                            </TabsTrigger>
                            <TabsTrigger value="info" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                                Informações
                            </TabsTrigger>
                        </TabsList>

                        {/* TAB 1: Macronutrientes */}
                        <TabsContent value="macros" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm sm:text-base">Valores por 100g</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                                        <div className="text-center p-2 sm:p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                                            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Calorias</p>
                                            <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400">
                                                {food.calories ? Math.round(food.calories) : '—'}
                                            </p>
                                            <p className="text-[10px] sm:text-xs text-muted-foreground">kcal</p>
                                        </div>
                                        <div className="text-center p-2 sm:p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                                            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Proteína</p>
                                            <p className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400">
                                                {food.protein ? food.protein.toFixed(1) : '—'}
                                            </p>
                                            <p className="text-[10px] sm:text-xs text-muted-foreground">g</p>
                                        </div>
                                        <div className="text-center p-2 sm:p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                                            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Carboidratos</p>
                                            <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                                                {food.carbs ? food.carbs.toFixed(1) : '—'}
                                            </p>
                                            <p className="text-[10px] sm:text-xs text-muted-foreground">g</p>
                                        </div>
                                        <div className="text-center p-2 sm:p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                                            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Gorduras</p>
                                            <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">
                                                {food.fat ? food.fat.toFixed(1) : '—'}
                                            </p>
                                            <p className="text-[10px] sm:text-xs text-muted-foreground">g</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Gorduras Detalhadas */}
                            {(food.saturated_fat || food.trans_fat || food.monounsaturated_fat || food.polyunsaturated_fat || food.cholesterol || food.fiber || food.sugar || food.sodium) && (
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm sm:text-base">Gorduras Detalhadas e Outros</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
                                            {food.fiber && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Fibra</p>
                                                    <p className="text-lg font-semibold">{food.fiber.toFixed(1)} g</p>
                                                </div>
                                            )}
                                            {food.sugar && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Açúcares</p>
                                                    <p className="text-lg font-semibold">{food.sugar.toFixed(1)} g</p>
                                                </div>
                                            )}
                                            {food.saturated_fat && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Gordura Saturada</p>
                                                    <p className="text-lg font-semibold">{food.saturated_fat.toFixed(1)} g</p>
                                                </div>
                                            )}
                                            {food.trans_fat && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Gordura Trans</p>
                                                    <p className="text-lg font-semibold">{food.trans_fat.toFixed(1)} g</p>
                                                </div>
                                            )}
                                            {food.monounsaturated_fat && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Gordura Monoinsaturada</p>
                                                    <p className="text-lg font-semibold">{food.monounsaturated_fat.toFixed(1)} g</p>
                                                </div>
                                            )}
                                            {food.polyunsaturated_fat && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Gordura Poliinsaturada</p>
                                                    <p className="text-lg font-semibold">{food.polyunsaturated_fat.toFixed(1)} g</p>
                                                </div>
                                            )}
                                            {food.cholesterol && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Colesterol</p>
                                                    <p className="text-lg font-semibold">{food.cholesterol.toFixed(0)} mg</p>
                                                </div>
                                            )}
                                            {food.sodium && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-muted-foreground">Sódio</p>
                                                    <p className="text-lg font-semibold">{food.sodium.toFixed(0)} mg</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        {/* TAB 2: Micronutrientes */}
                        <TabsContent value="micros" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
                            {(food.calcium || food.iron || food.magnesium || food.phosphorus || food.potassium || food.zinc || 
                              food.vitamin_a || food.vitamin_c || food.vitamin_d || food.vitamin_e || food.vitamin_b12 || food.folate) ? (
                                <>
                                    {/* Minerais */}
                                    {(food.calcium || food.iron || food.magnesium || food.phosphorus || food.potassium || food.zinc) && (
                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-sm sm:text-base">Minerais (mg por 100g)</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-0">
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                                                    {food.calcium && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Cálcio</p>
                                                            <p className="text-lg font-semibold">{food.calcium.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.iron && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Ferro</p>
                                                            <p className="text-lg font-semibold">{food.iron.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.magnesium && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Magnésio</p>
                                                            <p className="text-lg font-semibold">{food.magnesium.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.phosphorus && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Fósforo</p>
                                                            <p className="text-lg font-semibold">{food.phosphorus.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.potassium && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Potássio</p>
                                                            <p className="text-lg font-semibold">{food.potassium.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.zinc && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Zinco</p>
                                                            <p className="text-lg font-semibold">{food.zinc.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Vitaminas */}
                                    {(food.vitamin_a || food.vitamin_c || food.vitamin_d || food.vitamin_e || food.vitamin_b12 || food.folate) && (
                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-sm sm:text-base">Vitaminas (mg por 100g)</CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-0">
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                                                    {food.vitamin_a && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Vitamina A</p>
                                                            <p className="text-lg font-semibold">{food.vitamin_a.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.vitamin_c && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Vitamina C</p>
                                                            <p className="text-lg font-semibold">{food.vitamin_c.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.vitamin_d && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Vitamina D</p>
                                                            <p className="text-lg font-semibold">{food.vitamin_d.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.vitamin_e && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Vitamina E</p>
                                                            <p className="text-lg font-semibold">{food.vitamin_e.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.vitamin_b12 && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Vitamina B12</p>
                                                            <p className="text-lg font-semibold">{food.vitamin_b12.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                    {food.folate && (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground">Folato</p>
                                                            <p className="text-lg font-semibold">{food.folate.toFixed(1)} mg</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </>
                            ) : (
                                <Card>
                                    <CardContent className="py-8 text-center">
                                        <Info className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            Nenhum micronutriente cadastrado para este alimento
                                        </p>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        {/* TAB 3: Informações */}
                        <TabsContent value="info" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm sm:text-base">Informações Gerais</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-3 sm:space-y-4">
                                    {food.description && (
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                                            <p className="text-sm">{food.description}</p>
                                        </div>
                                    )}
                                    {food.preparation && (
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Modo de Preparo</p>
                                            <p className="text-sm">{food.preparation}</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-1">Porção Padrão</p>
                                            <p className="text-sm font-semibold">{food.portion_size || 100}g</p>
                                        </div>
                                        {food.source && (
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">Fonte</p>
                                                <Badge variant="outline" className={sourceColors[food.source]}>
                                                    {sourceLabels[food.source] || food.source}
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                    {food.food_measures && food.food_measures.length > 0 && (
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-2">Medidas Caseiras Cadastradas</p>
                                            <div className="flex flex-wrap gap-2">
                                                {food.food_measures.map((measure) => (
                                                    <Badge key={measure.id} variant="outline">
                                                        {measure.measure_label} ({measure.quantity_grams}g)
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

export default FoodDetailsDialog;

