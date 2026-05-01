import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Send, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isFieldVisible } from '@/lib/utils/conditionalLogic';

export function AnamnesisWizard({
    recordId,
    template,
    content,
    renderField,
    lgpdConsented,
    setLgpdConsented,
    onSaveDraft,
    onSubmit,
    isSaving,
    isSubmitting,
    nutritionistName
}) {
    const { toast } = useToast();
    const sections = template?.sections || [];
    const totalSteps = sections.length + 1; // +1 para a tela final (LGPD e Envio)

    // Recuperar passo anterior do localStorage, se houver
    const storageKey = `anamnesis_step_${recordId}`;
    const [currentStep, setCurrentStep] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (parsed >= 0 && parsed < totalSteps) return parsed;
        }
        return 0;
    });

    useEffect(() => {
        localStorage.setItem(storageKey, currentStep.toString());
    }, [currentStep, storageKey]);

    const validateCurrentSection = () => {
        if (currentStep >= sections.length) return true; // Tela final não tem campos (exceto LGPD, checado no submit)

        const currentSection = sections[currentStep];
        for (const field of currentSection.fields || []) {
            if (field.required && isFieldVisible(field, content)) {
                const val = content[field.id];
                if (
                    val === undefined ||
                    val === null ||
                    val === '' ||
                    (Array.isArray(val) && val.length === 0)
                ) {
                    toast({
                        title: 'Campo obrigatório',
                        description: `O campo "${field.label}" precisa ser preenchido para continuar.`,
                        variant: 'destructive',
                    });
                    return false;
                }
            }
        }
        return true;
    };

    const handleNext = () => {
        if (validateCurrentSection()) {
            setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handlePrev = () => {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = () => {
        if (!lgpdConsented) {
            toast({
                title: 'Autorização necessária',
                description: 'Você deve aceitar os termos de privacidade para enviar.',
                variant: 'destructive',
            });
            return;
        }
        onSubmit();
    };

    const progressPercentage = ((currentStep + 1) / totalSteps) * 100;

    return (
        <div className="space-y-6">
            {/* Barra de Progresso */}
            <div className="space-y-2 mb-8">
                <div className="flex justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <span>Passo {currentStep + 1} de {totalSteps}</span>
                    <span>{Math.round(progressPercentage)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-in-out"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
            </div>

            {/* Conteúdo da Etapa */}
            <div className="min-h-[400px]">
                {currentStep < sections.length ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-xl font-bold text-slate-800 pb-2 border-b-2 border-slate-200/70 inline-block">
                            {sections[currentStep].title}
                        </h2>
                        <div className="grid gap-5">
                            {sections[currentStep].fields?.map((field) => 
                                isFieldVisible(field, content) ? renderField(field) : null
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center space-y-3 mb-8 pt-4">
                            <h2 className="text-2xl font-bold text-slate-800">Quase lá!</h2>
                            <p className="text-slate-500">
                                Você respondeu todas as seções. Revise se necessário ou conclua o envio abaixo.
                            </p>
                        </div>

                        <div className="p-6 bg-white rounded-2xl border-2 border-blue-100 shadow-sm space-y-6">
                            <div className="flex items-start space-x-3 bg-blue-50/50 p-4 rounded-xl">
                                <Checkbox
                                    id="lgpd"
                                    checked={lgpdConsented}
                                    onCheckedChange={setLgpdConsented}
                                    className="mt-1 shrink-0"
                                />
                                <Label htmlFor="lgpd" className="font-normal text-sm text-slate-600 leading-relaxed cursor-pointer">
                                    Declaro que as informações acima são verdadeiras e autorizo o armazenamento e tratamento
                                    destes dados de saúde exclusivamente por{' '}
                                    <strong>{nutritionistName}</strong> para fins de acompanhamento nutricional,
                                    conforme a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/18).
                                </Label>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Rodapé com Navegação */}
            <div className="pt-8 mt-8 border-t border-slate-200 flex flex-col-reverse sm:flex-row gap-3 items-center justify-between">
                <Button
                    variant="ghost"
                    onClick={onSaveDraft}
                    disabled={isSaving || isSubmitting}
                    className="w-full sm:w-auto text-slate-500"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Rascunho e Sair
                </Button>

                <div className="flex gap-3 w-full sm:w-auto">
                    {currentStep > 0 && (
                        <Button
                            variant="outline"
                            onClick={handlePrev}
                            disabled={isSaving || isSubmitting}
                            className="flex-1 sm:flex-none"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                        </Button>
                    )}

                    {currentStep < sections.length ? (
                        <Button
                            onClick={handleNext}
                            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
                        >
                            Próximo <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSubmit}
                            disabled={isSaving || isSubmitting || !lgpdConsented}
                            className="flex-1 sm:flex-none font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            ) : (
                                <Send className="w-5 h-5 mr-2" />
                            )}
                            Concluir e Enviar
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
