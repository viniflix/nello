import { useState, useEffect } from 'react';
import { Search, FileText, Tag, Calendar, Utensils, Loader2, Ruler } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { getTemplates, getMealPlanById, applyTemplateToPatient } from '@/lib/supabase/meal-plan-queries';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { findFirstMatch } from '@/utils/stringUtils';

/**
 * TemplateManagerDialog - Gerenciador de Templates de Planos Alimentares
 * 
 * Permite ao nutricionista visualizar, buscar e aplicar templates de planos alimentares
 */
export default function TemplateManagerDialog({ 
    open, 
    onOpenChange, 
    patientId, 
    nutritionistId,
    onTemplateApplied 
}) {
    const { toast } = useToast();
    const [templates, setTemplates] = useState([]);
    const [filteredTemplates, setFilteredTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateDetails, setTemplateDetails] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useState(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [patientCalorieGoal, setPatientCalorieGoal] = useState(null);
    const [autoScale, setAutoScale] = useState(false);
    const [scaleFactor, setScaleFactor] = useState(1.0);
    const [allergyWarningOpen, setAllergyWarningOpen] = useState(false);
    const [conflictingFoods, setConflictingFoods] = useState([]);
    const [pendingApplication, setPendingApplication] = useState(null);
    const [selectedMealIds, setSelectedMealIds] = useState(new Set());

    // Carregar templates e meta calórica do paciente
    useEffect(() => {
        if (open && nutritionistId) {
            loadTemplates();
        }
        if (open && patientId) {
            loadPatientCalorieGoal();
        }
    }, [open, nutritionistId, patientId]);

    // Filtrar templates por busca e tag
    useEffect(() => {
        let filtered = templates;

        // Filtrar por termo de busca
        if (searchTerm) {
            filtered = filtered.filter(t => 
                t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }

        // Filtrar por tag
        if (selectedTag) {
            filtered = filtered.filter(t => {
                if (!t.template_tags) return false;
                const tags = Array.isArray(t.template_tags) ? t.template_tags : [t.template_tags];
                return tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase());
            });
        }

        setFilteredTemplates(filtered);
    }, [templates, searchTerm, selectedTag]);

    // Calcular totais nutricionais do template (apenas refeições selecionadas)
    const calculateTotals = (details, selectedIds = null) => {
        if (!details || !details.meals) return { calories: 0, protein: 0, carbs: 0, fat: 0 };

        // Filtrar refeições selecionadas se fornecido
        const mealsToCalculate = selectedIds && selectedIds.size > 0
            ? details.meals.filter(meal => selectedIds.has(meal.id))
            : details.meals;

        return mealsToCalculate.reduce(
            (acc, meal) => ({
                calories: acc.calories + (parseFloat(meal.total_calories) || 0),
                protein: acc.protein + (parseFloat(meal.total_protein) || 0),
                carbs: acc.carbs + (parseFloat(meal.total_carbs) || 0),
                fat: acc.fat + (parseFloat(meal.total_fat) || 0)
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
    };

    // Carregar detalhes do template selecionado
    useEffect(() => {
        if (selectedTemplate) {
            loadTemplateDetails(selectedTemplate.id);
        }
    }, [selectedTemplate]);

    // Calcular scaleFactor quando templateDetails, autoScale ou selectedMealIds mudarem
    useEffect(() => {
        if (templateDetails && patientCalorieGoal && autoScale && selectedMealIds.size > 0) {
            const templateTotal = calculateTotals(templateDetails, selectedMealIds).calories;
            if (templateTotal > 0) {
                const factor = patientCalorieGoal / templateTotal;
                setScaleFactor(factor);
            }
        } else {
            setScaleFactor(1.0);
        }
    }, [templateDetails, patientCalorieGoal, autoScale, selectedMealIds]);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const { data, error } = await getTemplates(nutritionistId);
            if (error) throw error;
            setTemplates(data || []);
            setFilteredTemplates(data || []);
        } catch (error) {
            console.error('Erro ao carregar templates:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os templates.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const loadTemplateDetails = async (templateId) => {
        try {
            const { data, error } = await getMealPlanById(templateId);
            if (error) throw error;
            setTemplateDetails(data);
            // Reset auto-scale quando mudar de template
            setAutoScale(false);
            // Selecionar todas as refeições por padrão
            if (data?.meals) {
                const allMealIds = new Set(data.meals.map(meal => meal.id));
                setSelectedMealIds(allMealIds);
            } else {
                setSelectedMealIds(new Set());
            }
        } catch (error) {
            console.error('Erro ao carregar detalhes do template:', error);
            setTemplateDetails(null);
            setSelectedMealIds(new Set());
        }
    };

    const loadPatientCalorieGoal = async () => {
        if (!patientId) return;

        try {
            // Tentar buscar de patient_goals (meta ativa)
            const { data: activeGoal } = await supabase
                .from('patient_goals')
                .select('daily_calorie_goal')
                .eq('patient_id', patientId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (activeGoal?.daily_calorie_goal) {
                setPatientCalorieGoal(parseFloat(activeGoal.daily_calorie_goal));
                return;
            }

            // Fallback: buscar de prescriptions (prescrição ativa)
            const today = new Date().toISOString().split('T')[0];
            const { data: prescription } = await supabase
                .from('prescriptions')
                .select('calories')
                .eq('patient_id', patientId)
                .lte('start_date', today)
                .or(`end_date.is.null,end_date.gte.${today}`)
                .order('start_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (prescription?.calories) {
                setPatientCalorieGoal(parseFloat(prescription.calories));
                return;
            }

            // Fallback: buscar de energy_expenditure_calculations (último cálculo)
            const { data: energyCalc } = await supabase
                .from('energy_expenditure_calculations')
                .select('total_daily_energy_expenditure')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (energyCalc?.total_daily_energy_expenditure) {
                setPatientCalorieGoal(parseFloat(energyCalc.total_daily_energy_expenditure));
                return;
            }

            // Se não encontrou nada, deixar null
            setPatientCalorieGoal(null);
        } catch (error) {
            console.error('Erro ao buscar meta calórica do paciente:', error);
            setPatientCalorieGoal(null);
        }
    };

    /**
     * Verifica conflitos entre alimentos do template e alergias/aversões do paciente
     * Considera apenas as refeições selecionadas
     * @returns {string[]} Array de nomes de alimentos que conflitam
     */
    const checkFoodConflicts = async () => {
        if (!templateDetails || !patientId) return [];

        try {
            // Buscar anamnese do paciente (com content completo)
            const { data: anamnesis, error: anamnesisError } = await getLatestAnamnesis(patientId, true);
            
            if (anamnesisError || !anamnesis || !anamnesis.content) {
                // Se não houver anamnese, não há conflitos
                return [];
            }

            const content = anamnesis.content;
            
            // Extrair alergias
            const allergies = content.historico_clinico?.alergias || [];
            const allergyFoods = allergies
                .filter(a => a && a.alimento)
                .map(a => a.alimento.trim())
                .filter(f => f.length > 0);

            // Extrair aversões (string de texto livre)
            const aversionsText = content.habitos_alimentares?.alimentos_nao_gosta || '';
            const aversionsList = aversionsText
                .split(/[,;]/)
                .map(a => a.trim())
                .filter(a => a.length > 0);

            // Combinar todas as restrições
            const restrictions = [...allergyFoods, ...aversionsList];
            
            if (restrictions.length === 0) {
                return [];
            }

            // Extrair alimentos apenas das refeições SELECIONADAS
            const templateFoods = [];
            if (templateDetails.meals) {
                for (const meal of templateDetails.meals) {
                    // Verificar se a refeição está selecionada
                    if (!selectedMealIds.has(meal.id)) {
                        continue; // Pular refeições não selecionadas
                    }

                    if (meal.foods) {
                        for (const food of meal.foods) {
                            // Pegar nome do alimento (pode estar em food.food ou food.foods dependendo da query)
                            const foodName = food.food?.name || food.foods?.name || food.name || '';
                            if (foodName) {
                                templateFoods.push(foodName);
                            }
                        }
                    }
                }
            }

            // Verificar conflitos (case insensitive, partial match)
            const conflicts = [];
            for (const foodName of templateFoods) {
                const matchedRestriction = findFirstMatch(foodName, restrictions);
                if (matchedRestriction) {
                    // Evitar duplicatas
                    if (!conflicts.includes(foodName)) {
                        conflicts.push(foodName);
                    }
                }
            }

            return conflicts;
        } catch (error) {
            console.error('Erro ao verificar conflitos de alimentos:', error);
            // Em caso de erro, não bloquear a aplicação (fail-safe)
            return [];
        }
    };

    const handleApplyTemplate = async (skipCheck = false) => {
        if (!selectedTemplate || !patientId) return;

        // Verificar se pelo menos uma refeição está selecionada
        if (selectedMealIds.size === 0) {
            toast({
                title: 'Nenhuma Refeição Selecionada',
                description: 'Selecione pelo menos uma refeição para importar.',
                variant: 'destructive'
            });
            return;
        }

        // Verificar conflitos ANTES de aplicar (a menos que skipCheck seja true)
        if (!skipCheck) {
            const conflicts = await checkFoodConflicts();
            
            if (conflicts.length > 0) {
                // Mostrar alerta de conflito
                setConflictingFoods(conflicts);
                setAllergyWarningOpen(true);
                // Salvar os parâmetros da aplicação para usar depois
                setPendingApplication({
                    templateId: selectedTemplate.id,
                    patientId: patientId,
                    scaleFactor: autoScale ? scaleFactor : 1.0,
                    selectedMealIds: Array.from(selectedMealIds)
                });
                return;
            }
        }

        // Se não há conflitos ou skipCheck é true, aplicar normalmente
        setApplying(true);
        try {
            const params = pendingApplication || {
                templateId: selectedTemplate.id,
                patientId: patientId,
                scaleFactor: autoScale ? scaleFactor : 1.0,
                selectedMealIds: Array.from(selectedMealIds)
            };

            const { data, error } = await applyTemplateToPatient(
                params.templateId, 
                params.patientId, 
                null, 
                params.scaleFactor,
                params.selectedMealIds
            );
            if (error) throw error;

            const scaleMessage = params.scaleFactor !== 1.0
                ? ` (quantidades ajustadas para ${Math.round(patientCalorieGoal)} kcal)`
                : '';
            
            const mealCount = params.selectedMealIds?.length || selectedMealIds.size;
            const mealMessage = mealCount < (templateDetails?.meals?.length || 0)
                ? ` (${mealCount} de ${templateDetails?.meals?.length || 0} refeições importadas)`
                : '';

            toast({
                title: 'Template Aplicado',
                description: `O template "${selectedTemplate.name}" foi aplicado ao paciente com sucesso.${scaleMessage}${mealMessage}`,
            });

            if (onTemplateApplied) {
                onTemplateApplied(data);
            }

            // Limpar estados
            setPendingApplication(null);
            setConflictingFoods([]);
            setAllergyWarningOpen(false);
            onOpenChange(false);
        } catch (error) {
            console.error('Erro ao aplicar template:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível aplicar o template.',
                variant: 'destructive'
            });
        } finally {
            setApplying(false);
        }
    };

    const handleIgnoreAndApply = () => {
        setAllergyWarningOpen(false);
        // Aplicar ignorando o aviso
        handleApplyTemplate(true);
    };

    // Extrair todas as tags únicas dos templates
    const allTags = Array.from(
        new Set(
            templates
                .filter(t => t.template_tags)
                .flatMap(t => Array.isArray(t.template_tags) ? t.template_tags : [t.template_tags])
        )
    );

    const totals = templateDetails ? calculateTotals(templateDetails, selectedMealIds) : null;

    // Verificar se deve mostrar o toggle de auto-scaling
    const shouldShowAutoScale = totals && patientCalorieGoal && totals.calories > 0;
    const calorieDifference = shouldShowAutoScale 
        ? Math.abs((totals.calories - patientCalorieGoal) / totals.calories) * 100 
        : 0;
    const showAutoScaleToggle = shouldShowAutoScale && calorieDifference > 10;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Meus Modelos de Dieta
                    </DialogTitle>
                    <DialogDescription>
                        Selecione um template para aplicar ao paciente
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 gap-4 overflow-hidden">
                    {/* Sidebar: Lista de Templates */}
                    <div className="w-1/3 flex flex-col border-r pr-4">
                        {/* Busca */}
                        <div className="mb-4">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar templates..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                        </div>

                        {/* Filtros por Tag */}
                        {allTags.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-semibold mb-2">Filtrar por Tag:</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant={selectedTag === null ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSelectedTag(null)}
                                    >
                                        Todos
                                    </Button>
                                    {allTags.map(tag => (
                                        <Button
                                            key={tag}
                                            variant={selectedTag === tag ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setSelectedTag(tag)}
                                        >
                                            {tag}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Lista de Templates */}
                        <ScrollArea className="flex-1">
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : filteredTemplates.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>Nenhum template encontrado</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredTemplates.map(template => (
                                        <Card
                                            key={template.id}
                                            className={`cursor-pointer transition-colors ${
                                                selectedTemplate?.id === template.id
                                                    ? 'border-primary bg-primary/5'
                                                    : 'hover:bg-muted/50'
                                            }`}
                                            onClick={() => setSelectedTemplate(template)}
                                        >
                                            <CardContent className="p-4">
                                                <div className="space-y-2">
                                                    <h3 className="font-semibold text-sm">
                                                        {template.name}
                                                    </h3>
                                                    {template.description && (
                                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                                            {template.description}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Utensils className="w-3 h-3" />
                                                        <span>
                                                            {template.daily_calories
                                                                ? `${Math.round(template.daily_calories)} kcal`
                                                                : 'N/A'}
                                                        </span>
                                                    </div>
                                                    {template.template_tags && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {(Array.isArray(template.template_tags)
                                                                ? template.template_tags
                                                                : [template.template_tags]
                                                            ).map((tag, idx) => (
                                                                <Badge
                                                                    key={idx}
                                                                    variant="secondary"
                                                                    className="text-xs"
                                                                >
                                                                    <Tag className="w-2 h-2 mr-1" />
                                                                    {tag}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* Main Content: Preview do Template */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedTemplate ? (
                            <>
                                {templateDetails ? (
                                    <ScrollArea className="flex-1">
                                        <div className="space-y-4 pr-4">
                                            {/* Header do Template */}
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle>{templateDetails.name}</CardTitle>
                                                    {templateDetails.description && (
                                                        <p className="text-sm text-muted-foreground">
                                                            {templateDetails.description}
                                                        </p>
                                                    )}
                                                </CardHeader>
                                                <CardContent>
                                                    {/* Totais Nutricionais */}
                                                    {totals && (
                                                        <div className="grid grid-cols-4 gap-4">
                                                            <div className="text-center">
                                                                <p className="text-xs text-muted-foreground">Calorias</p>
                                                                <p className="text-2xl font-bold">{Math.round(totals.calories)}</p>
                                                                <p className="text-xs text-muted-foreground">kcal</p>
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-xs text-muted-foreground">Proteínas</p>
                                                                <p className="text-2xl font-bold">{Math.round(totals.protein)}</p>
                                                                <p className="text-xs text-muted-foreground">g</p>
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-xs text-muted-foreground">Carboidratos</p>
                                                                <p className="text-2xl font-bold">{Math.round(totals.carbs)}</p>
                                                                <p className="text-xs text-muted-foreground">g</p>
                                                            </div>
                                                            <div className="text-center">
                                                                <p className="text-xs text-muted-foreground">Gorduras</p>
                                                                <p className="text-2xl font-bold">{Math.round(totals.fat)}</p>
                                                                <p className="text-xs text-muted-foreground">g</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Informações Adicionais */}
                                                    <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Utensils className="w-4 h-4" />
                                                            <span>{templateDetails.meals?.length || 0} refeições</span>
                                                        </div>
                                                        {templateDetails.template_tags && (
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <Tag className="w-4 h-4 text-muted-foreground" />
                                                                {(Array.isArray(templateDetails.template_tags)
                                                                    ? templateDetails.template_tags
                                                                    : [templateDetails.template_tags]
                                                                ).map((tag, idx) => (
                                                                    <Badge key={idx} variant="secondary">
                                                                        {tag}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            {/* Seletor de Refeições para Importar */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-semibold text-sm">Selecione as Refeições para Importar:</h3>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                if (templateDetails?.meals) {
                                                                    const allIds = new Set(templateDetails.meals.map(m => m.id));
                                                                    setSelectedMealIds(allIds);
                                                                }
                                                            }}
                                                            className="text-xs h-7"
                                                        >
                                                            Selecionar Todas
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setSelectedMealIds(new Set())}
                                                            className="text-xs h-7"
                                                        >
                                                            Desmarcar Todas
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {templateDetails.meals?.map((meal, idx) => {
                                                        const isSelected = selectedMealIds.has(meal.id);
                                                        return (
                                                            <Card 
                                                                key={meal.id || idx}
                                                                className={`cursor-pointer transition-colors ${
                                                                    isSelected 
                                                                        ? 'border-primary bg-primary/5' 
                                                                        : 'hover:bg-muted/50'
                                                                }`}
                                                                onClick={() => {
                                                                    const newSet = new Set(selectedMealIds);
                                                                    if (isSelected) {
                                                                        newSet.delete(meal.id);
                                                                    } else {
                                                                        newSet.add(meal.id);
                                                                    }
                                                                    setSelectedMealIds(newSet);
                                                                }}
                                                            >
                                                                <CardContent className="p-4">
                                                                    <div className="flex items-start gap-3">
                                                                        <Checkbox
                                                                            checked={isSelected}
                                                                            onCheckedChange={(checked) => {
                                                                                const newSet = new Set(selectedMealIds);
                                                                                if (checked) {
                                                                                    newSet.add(meal.id);
                                                                                } else {
                                                                                    newSet.delete(meal.id);
                                                                                }
                                                                                setSelectedMealIds(newSet);
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                        <div className="flex-1">
                                                                            <div className="flex items-start justify-between">
                                                                                <div className="flex-1">
                                                                                    <h4 className="font-semibold">{meal.name}</h4>
                                                                                    <p className="text-xs text-muted-foreground">
                                                                                        {meal.meal_type}
                                                                                    </p>
                                                                                </div>
                                                                                <div className="text-right text-sm">
                                                                                    <p className="font-semibold">
                                                                                        {Math.round(meal.total_calories || 0)} kcal
                                                                                    </p>
                                                                                    <p className="text-xs text-muted-foreground">
                                                                                        P: {Math.round(meal.total_protein || 0)}g | 
                                                                                        C: {Math.round(meal.total_carbs || 0)}g | 
                                                                                        G: {Math.round(meal.total_fat || 0)}g
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            {meal.foods && meal.foods.length > 0 && (
                                                                                <div className="mt-2 pt-2 border-t">
                                                                                    <p className="text-xs text-muted-foreground">
                                                                                        {meal.foods.length} alimento(s)
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                                {templateDetails.meals && templateDetails.meals.length > 0 && (
                                                    <p className="text-xs text-muted-foreground text-center">
                                                        {selectedMealIds.size} de {templateDetails.meals.length} refeições selecionadas
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </ScrollArea>
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                    </div>
                                )}

                                {/* Smart Scaling Toggle */}
                                {showAutoScaleToggle && (
                                    <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                                        <Ruler className="h-4 w-4 text-blue-600" />
                                        <AlertDescription>
                                            <div className="space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <Checkbox
                                                        id="auto-scale"
                                                        checked={autoScale}
                                                        onCheckedChange={(checked) => setAutoScale(checked === true)}
                                                    />
                                                    <div className="flex-1 space-y-1">
                                                        <Label 
                                                            htmlFor="auto-scale" 
                                                            className="text-sm font-medium cursor-pointer"
                                                        >
                                                            Ajustar quantidades automaticamente para atingir {Math.round(patientCalorieGoal)} kcal?
                                                        </Label>
                                                        <p className="text-xs text-muted-foreground">
                                                            O template tem {Math.round(totals.calories)} kcal. 
                                                            {autoScale && (
                                                                <span className="block mt-1">
                                                                    As porções serão ajustadas por um fator de {scaleFactor.toFixed(2)}x 
                                                                    (aproximadamente {Math.round(totals.calories * scaleFactor)} kcal após ajuste).
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* Botão de Ação */}
                                <div className="mt-4 pt-4 border-t flex justify-end">
                                    <Button
                                        onClick={handleApplyTemplate}
                                        disabled={applying || !patientId}
                                        className="w-full sm:w-auto"
                                    >
                                        {applying ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Aplicando...
                                            </>
                                        ) : (
                                            <>
                                                Aplicar este Modelo
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <div className="text-center">
                                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    <p>Selecione um template para visualizar os detalhes</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>

            {/* AlertDialog: Aviso de Restrição Alimentar */}
            <AlertDialog open={allergyWarningOpen} onOpenChange={setAllergyWarningOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            ⚠️ Alerta de Restrição Alimentar
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                            <p>
                                Este modelo contém alimentos que o paciente marcou como alergia ou aversão:
                            </p>
                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                                <ul className="list-disc list-inside space-y-1">
                                    {conflictingFoods.map((food, idx) => (
                                        <li key={idx} className="font-semibold text-destructive">
                                            {food}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Deseja continuar mesmo assim? Esta ação pode causar reações adversas no paciente.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            setAllergyWarningOpen(false);
                            setConflictingFoods([]);
                            setPendingApplication(null);
                        }}>
                            Cancelar Importação
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleIgnoreAndApply}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Ignorar e Aplicar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}

