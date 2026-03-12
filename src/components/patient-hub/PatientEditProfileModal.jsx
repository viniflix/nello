import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Loader2, User, Ruler, Utensils, MessageSquare, ArrowRight, Camera } from 'lucide-react';
import { getAnthropometryRecords, createAnthropometryRecord } from '@/lib/supabase/anthropometry-queries';
import { updatePatientProfile } from '@/lib/supabase/patient-queries';
import { patientRoute } from '@/lib/utils/patientRoutes';

const profileSchema = z.object({
    full_name: z.string().min(2, "Nome é obrigatório").optional().or(z.literal('')),
    email: z.string().email("E-mail inválido").optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    birth_date: z.string().optional().or(z.literal('')),
    height: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(30, "Altura inválida").max(300, "Altura inválida").optional()),
    weight: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(2, "Peso inválido").max(500, "Peso inválido").optional()),
    gender: z.string().optional(),
    goal: z.string().optional(),
});

const PatientEditProfileModal = ({ isOpen, onClose, patientData, onSaveSuccess }) => {
    const [step, setStep] = useState('form'); // 'form' | 'warning'
    const [isSaving, setIsSaving] = useState(false);
    const [pendingData, setPendingData] = useState(null);
    const [activeTab, setActiveTab] = useState('info');
    const navigate = useNavigate();

    const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            full_name: '',
            email: '',
            phone: '',
            birth_date: '',
            height: '',
            weight: '',
            gender: '',
            goal: ''
        }
    });

    const birthDateValue = watch('birth_date');

    const calculateAge = (dob) => {
        if (!dob) return '--';
        const birth = new Date(dob);
        if (isNaN(birth.getTime())) return '--';
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    useEffect(() => {
        if (isOpen && patientData) {
            reset({
                full_name: patientData.full_name || '',
                email: patientData.email || '',
                phone: patientData.phone || '',
                birth_date: patientData.birth_date || '',
                height: patientData.height || '',
                weight: patientData.weight || '',
                gender: patientData.gender || '',
                goal: patientData.goal || ''
            });
            setStep('form');
            setPendingData(null);
            setActiveTab('info');
        }
    }, [isOpen, patientData, reset]);

    const navigateToModule = (moduleSuffix) => {
        if (!patientData) return;
        onClose();
        navigate(patientRoute(patientData, moduleSuffix));
    };

    const onSubmit = async (data) => {
        setIsSaving(true);
        try {
            // Verificar mudança antropométrica
            const isAnthropometryChanged = 
                (data.height && Number(data.height) !== Number(patientData.height)) || 
                (data.weight && Number(data.weight) !== Number(patientData.weight));

            if (isAnthropometryChanged) {
                const { data: records, error } = await getAnthropometryRecords(patientData.id, { limit: 1 });
                if (error) throw error;

                if (records && records.length > 0) {
                    setPendingData(data);
                    setStep('warning');
                    return; // pausa aqui e espera a decisão do warning
                } else {
                    await performSave(data, true);
                    return;
                }
            }

            // Se não alterou peso/altura (ou não acionou o alarme de histórico), salva normalmente:
            await performSave(data, false);
        } catch (error) {
            console.error("Erro ao verificar registros:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const performSave = async (data, createEvolution = false) => {
        setIsSaving(true);
        try {
            const updatePayload = {
                full_name: data.full_name || null,
                phone: data.phone || null,
                birth_date: data.birth_date || null,
                height: data.height || null,
                weight: data.weight || null,
                gender: data.gender || null,
                goal: data.goal || null
            };

            await updatePatientProfile(patientData.id, updatePayload);

            if (createEvolution) {
                await createAnthropometryRecord({
                    patient_id: patientData.id,
                    height: updatePayload.height,
                    weight: updatePayload.weight,
                    record_date: new Date().toISOString(),
                    notes: "Registro automático via Edição de Perfil Rapida"
                });
            }

            if (onSaveSuccess) onSaveSuccess();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar perfil:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden bg-background">
                {step === 'form' ? (
                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-[85vh] sm:h-auto max-h-[800px]">
                        <DialogHeader className="p-6 pb-2">
                            <DialogTitle className="text-xl">Editar Perfil do Paciente</DialogTitle>
                            <DialogDescription>
                                Uma visão completa das informações e atalhos rápidos do paciente.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto px-6 py-2">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList className="grid grid-cols-4 mb-4">
                                    <TabsTrigger value="info" className="text-xs">Identificação</TabsTrigger>
                                    <TabsTrigger value="body" className="text-xs">Físico</TabsTrigger>
                                    <TabsTrigger value="nutrition" className="text-xs">Nutrição</TabsTrigger>
                                    <TabsTrigger value="engajamento" className="text-xs">Engajamento</TabsTrigger>
                                </TabsList>

                                {/* TAB 1: INFO */}
                                <TabsContent value="info" className="space-y-4 mt-0">
                                    <div className="flex items-center gap-4 mb-2 p-4 bg-muted/30 rounded-lg border">
                                        <div className="relative">
                                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/20">
                                                {patientData?.avatar_url ? (
                                                    <img src={patientData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="h-8 w-8 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="absolute -bottom-2 -right-2 bg-background border rounded-full p-1.5 shadow-sm cursor-pointer hover:bg-muted transition-colors">
                                                <Camera className="w-3 h-3 text-foreground" />
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold">Foto de Perfil</h4>
                                            <p className="text-xs text-muted-foreground">Clique no ícone para alterar a foto (Em breve)</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="full_name">Nome Completo</Label>
                                            <Input id="full_name" {...register('full_name')} placeholder="Ex: Maria Silva" />
                                            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">E-mail</Label>
                                            <Input id="email" type="email" {...register('email')} disabled className="bg-muted/50" />
                                            <p className="text-[10px] text-muted-foreground">E-mail de acesso não pode ser alterado por aqui.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="phone">Telefone / WhatsApp</Label>
                                            <Input id="phone" {...register('phone')} placeholder="(11) 99999-9999" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="birth_date">Data Nasc.</Label>
                                                <Input id="birth_date" type="date" {...register('birth_date')} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Idade</Label>
                                                <div className="flex h-10 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground items-center">
                                                    {calculateAge(birthDateValue)} anos
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label htmlFor="gender">Sexo Biológico</Label>
                                            <select 
                                                id="gender" 
                                                {...register('gender')}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            >
                                                <option value="">Selecione...</option>
                                                <option value="male">Masculino</option>
                                                <option value="female">Feminino</option>
                                            </select>
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* TAB 2: FISICO */}
                                <TabsContent value="body" className="space-y-4 mt-0">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="height_body">Altura Atual (cm)</Label>
                                            <Input id="height_body" type="number" step="0.1" {...register('height')} placeholder="Ex: 175" />
                                            {errors.height && <p className="text-xs text-destructive">{errors.height.message}</p>}
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="weight_body">Peso Atual (kg)</Label>
                                            <Input id="weight_body" type="number" step="0.1" {...register('weight')} placeholder="Ex: 70.5" />
                                            {errors.weight && <p className="text-xs text-destructive">{errors.weight.message}</p>}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="goal_body">Objetivo Principal do Tratamento</Label>
                                        <select 
                                            id="goal_body" 
                                            {...register('goal')}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
                                        >
                                            <option value="">Selecione...</option>
                                            <option value="lose">Emagrecimento</option>
                                            <option value="gain">Hipertrofia / Ganho de Massa</option>
                                            <option value="maintain">Manutenção</option>
                                            <option value="health">Saúde e Bem-estar</option>
                                            <option value="performance">Performance Esportiva</option>
                                        </select>
                                    </div>

                                    <div className="pt-4 border-t mt-4">
                                        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 flex flex-col gap-3">
                                            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
                                                <Ruler className="w-5 h-5 shrink-0" />
                                                <h4 className="text-sm font-semibold">Avaliação Antropométrica Avançada</h4>
                                            </div>
                                            <p className="text-xs text-blue-700/80 dark:text-blue-400">
                                                O perfil básico armazena apenas Peso e Altura. Para registrar pregas cutâneas, circunferências, bioimpedância e outras métricas, utilize o módulo completo.
                                            </p>
                                            <Button 
                                                type="button" 
                                                variant="outline" 
                                                className="w-full bg-white dark:bg-background border-blue-300 hover:bg-blue-100" 
                                                onClick={() => navigateToModule('anthropometry')}
                                            >
                                                Ir para Módulo Corporal <ArrowRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* TAB 3: NUTRIÇÃO */}
                                <TabsContent value="nutrition" className="space-y-4 mt-0">
                                    <div className="p-5 rounded-lg border-2 border-dashed border-[#a9b388] bg-[#fefae0]/30 dark:bg-muted/10 text-center flex flex-col items-center gap-3">
                                        <div className="p-3 bg-[#a9b388]/20 rounded-full">
                                            <Utensils className="w-6 h-6 text-[#5f6f52]" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-foreground">Gestão Nutricional</h4>
                                            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                                                Crie dietas, gerencie cardápios e acompanhe as substituições diretamente no módulo alimentar detalhado.
                                            </p>
                                        </div>
                                        <Button 
                                            type="button" 
                                            className="mt-2 bg-[#5f6f52] hover:bg-[#4a5a3f]" 
                                            onClick={() => navigateToModule('meal-plan')}
                                        >
                                            Acessar Plano Alimentar
                                        </Button>
                                    </div>
                                </TabsContent>

                                {/* TAB 4: ENGAJAMENTO */}
                                <TabsContent value="engajamento" className="space-y-4 mt-0">
                                    <div className="p-5 rounded-lg border-2 border-dashed border-[#c4661f]/40 bg-[#c4661f]/5 dark:bg-[#c4661f]/10 text-center flex flex-col items-center gap-3">
                                        <div className="p-3 bg-[#c4661f]/20 rounded-full">
                                            <MessageSquare className="w-6 h-6 text-[#c4661f]" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-foreground">Comunicação e Adesão</h4>
                                            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                                                Acompanhe diários, conquistas e envie alertas personalizados para manter o paciente engajado no plano.
                                            </p>
                                        </div>
                                        <Button 
                                            type="button" 
                                            variant="outline"
                                            className="mt-2 border-[#c4661f] text-[#c4661f] hover:bg-[#c4661f]/10" 
                                            onClick={() => navigateToModule('adherence')}
                                        >
                                            Ver Métricas de Adesão
                                        </Button>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>

                        <DialogFooter className="p-6 pt-4 border-t bg-muted/20">
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                            <Button type="submit" disabled={isSaving} className="bg-primary">
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Salvar Mudanças Rápidas
                            </Button>
                        </DialogFooter>
                    </form>
                ) : (
                    // ESTADO DE ALERTA DE ANTROPOMETRIA
                    <div className="p-6">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-500/20">
                                    <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-500" />
                                </div>
                                <DialogTitle className="text-xl">Atenção ao Histórico</DialogTitle>
                            </div>
                            <DialogDescription className="pt-2 text-base">
                                Já existem dados antropométricos cadastrados para este paciente (peso/altura anteriores).
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-6 space-y-4">
                            <div className="bg-muted/50 p-4 rounded-lg border text-sm">
                                Como você alterou o Peso ou Altura na aba anterior, precisamos saber como registrar isso no sistema:
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    className="h-auto p-4 justify-start text-left border-border hover:bg-muted"
                                    onClick={() => performSave(pendingData, false)} 
                                    disabled={isSaving}
                                >
                                    <div>
                                        <div className="font-semibold text-foreground mb-1">Apenas Corrigir Erro de Digitação</div>
                                        <div className="text-xs text-muted-foreground font-normal whitespace-normal">Atualiza o perfil básico do paciente mas não mexe nos gráficos de acompanhamento de peso no dashboard.</div>
                                    </div>
                                </Button>
                                
                                <Button 
                                    type="button" 
                                    variant="default"
                                    className="h-auto p-4 justify-start text-left bg-blue-600 hover:bg-blue-700"
                                    onClick={() => performSave(pendingData, true)} 
                                    disabled={isSaving}
                                >
                                    <div>
                                        <div className="font-semibold text-white mb-1">Registrar Nova Evolução (Hoje)</div>
                                        <div className="text-xs text-blue-100 font-normal whitespace-normal">Cria um novo ponto no gráfico de evolução física do paciente com a data de hoje. (Recomendado)</div>
                                    </div>
                                    {isSaving && <Loader2 className="ml-auto h-5 w-5 animate-spin text-white" />}
                                </Button>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setStep('form')} disabled={isSaving}>Voltar e revisar</Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default PatientEditProfileModal;
