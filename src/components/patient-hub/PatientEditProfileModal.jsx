import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Loader2, User, Ruler, Utensils, Activity, ArrowRight, Camera } from 'lucide-react';
import { getAnthropometryRecords, createAnthropometryRecord } from '@/lib/supabase/anthropometry-queries';
import { updatePatientProfile } from '@/lib/supabase/patient-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { useToast } from '@/hooks/use-toast';

const profileSchema = z.object({
    name: z.string().min(2, "Nome é obrigatório").optional().or(z.literal('')),
    email: z.string().email("E-mail inválido").optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    birth_date: z.string().optional().or(z.literal('')),
    height: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(30, "Altura inválida").max(300, "Altura inválida").optional()),
    weight: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(2, "Peso inválido").max(500, "Peso inválido").optional()),
    gender: z.string().optional(),
    goal: z.string().optional(),
    observations: z.string().optional(),
    is_diabetic: z.boolean().optional()
});

const PatientEditProfileModal = ({ isOpen, onClose, patientData, onSaveSuccess }) => {
    const [step, setStep] = useState('form');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [pendingData, setPendingData] = useState(null);
    const [activeTab, setActiveTab] = useState('info');
    const [previewUrl, setPreviewUrl] = useState(null);
    
    const navigate = useNavigate();
    const { toast } = useToast();
    const fileInputRef = useRef(null);

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: '',
            email: '',
            phone: '',
            birth_date: '',
            height: '',
            weight: '',
            gender: '',
            goal: '',
            observations: '',
            is_diabetic: false
        }
    });

    const birthDateValue = watch('birth_date');
    const isDiabeticValue = watch('is_diabetic');

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
                name: patientData.name || patientData.full_name || '',
                email: patientData.email || '',
                phone: patientData.phone || '',
                birth_date: patientData.birth_date || '',
                height: patientData.height || '',
                weight: patientData.weight || '',
                gender: patientData.gender || '',
                goal: patientData.goal || '',
                observations: patientData.observations || '',
                is_diabetic: patientData.preferences?.is_diabetic === true
            });
            setStep('form');
            setPendingData(null);
            setActiveTab('info');
            setPreviewUrl(null);
        }
    }, [isOpen, patientData, reset]);

    const navigateToModule = (moduleSuffix) => {
        if (!patientData) return;
        onClose();
        navigate(patientRoute(patientData, moduleSuffix));
    };

    const handlePhotoClick = () => {
        fileInputRef.current?.click();
    };

    const handlePhotoChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file || !patientData?.id) return;

        if (!file.type.startsWith('image/')) {
            toast({ title: 'Erro', description: 'Selecione uma imagem.', variant: 'destructive' });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast({ title: 'Erro', description: 'Imagem muito grande (max 5MB).', variant: 'destructive' });
            return;
        }

        setIsUploadingPhoto(true);
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${patientData.id}/${fileName}`;

            // Upload
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Get URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Save immediately to profile so it doesn't get lost when tabs switch
            await updatePatientProfile(patientData.id, { avatar_url: publicUrl });
            
            toast({ title: 'Sucesso', description: 'Foto atualizada. Recarregue a página para aplicar em todos os menus.' });
            
            if (onSaveSuccess) onSaveSuccess(); // Refresh hub data behind modal
            
        } catch (error) {
            console.error('Erro ao subir foto:', error);
            setPreviewUrl(null);
            toast({ title: 'Erro', description: 'Não foi possível salvar foto.', variant: 'destructive' });
        } finally {
            setIsUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const onSubmit = async (data) => {
        setIsSaving(true);
        try {
            const isAnthropometryChanged = 
                (data.height && Number(data.height) !== Number(patientData.height)) || 
                (data.weight && Number(data.weight) !== Number(patientData.weight));

            if (isAnthropometryChanged) {
                const { data: records, error } = await getAnthropometryRecords(patientData.id, { limit: 1 });
                if (error) throw error;

                if (records && records.length > 0) {
                    setPendingData(data);
                    setStep('warning');
                    return; 
                } else {
                    await performSave(data, true);
                    return;
                }
            }

            // Normal save
            await performSave(data, false);
        } catch (error) {
            console.error("Erro ao verificar registros:", error);
            toast({ title: 'Erro', description: 'Ops, algo deu errado.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const performSave = async (data, createEvolution = false) => {
        setIsSaving(true);
        try {
            // Keep existing preferences, but update flags
            const updatedPreferences = {
                ...(patientData.preferences || {}),
                is_diabetic: data.is_diabetic
            };

            const updatePayload = {
                name: data.name || null,
                phone: data.phone || null,
                birth_date: data.birth_date || null,
                height: data.height || null,
                weight: data.weight || null,
                gender: data.gender || null,
                goal: data.goal || null,
                observations: data.observations || null,
                preferences: updatedPreferences
            };

            await updatePatientProfile(patientData.id, updatePayload);

            if (createEvolution) {
                await createAnthropometryRecord({
                    patient_id: patientData.id,
                    height: updatePayload.height,
                    weight: updatePayload.weight,
                    record_date: new Date().toISOString(),
                    notes: "Registro automático via Edição de Perfil Rápida"
                });
            }

            toast({ title: 'Sucesso', description: 'Perfil atualizado.' });
            if (onSaveSuccess) onSaveSuccess();
            onClose();
        } catch (error) {
            console.error("Erro ao salvar perfil:", error);
            toast({ title: 'Erro', description: 'Erro ao salvar os dados.', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden bg-background">
                {step === 'form' ? (
                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-[85vh] sm:h-auto sm:max-h-[80vh]">
                        <DialogHeader className="p-6 pb-2 shrink-0">
                            <DialogTitle className="text-xl">Editar Perfil do Paciente</DialogTitle>
                            <DialogDescription>
                                Uma visão completa das informações e configurações do paciente.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto px-6 py-2">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
                                <TabsList className="grid grid-cols-4 mb-4 shrink-0">
                                    <TabsTrigger value="info" className="text-xs">Identificação</TabsTrigger>
                                    <TabsTrigger value="body" className="text-xs">Físico</TabsTrigger>
                                    <TabsTrigger value="nutrition" className="text-xs">Nutrição</TabsTrigger>
                                    <TabsTrigger value="modules" className="text-xs">Módulos Extras</TabsTrigger>
                                </TabsList>

                                {/* Wrapper fixo pra evitar que os tabs fiquem mudando o tamanho do modal. Usamos min-h pra segurar a barra */}
                                <div className="min-h-[380px]">
                                    {/* TAB 1: INFO */}
                                    <TabsContent value="info" className="mt-0 space-y-4">
                                        <div className="flex items-center gap-4 mb-2 p-4 bg-muted/30 rounded-lg border">
                                            <div className="relative group" onClick={handlePhotoClick}>
                                                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/20 cursor-pointer">
                                                    {isUploadingPhoto ? (
                                                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                                    ) : (previewUrl || patientData?.avatar_url) ? (
                                                        <img src={previewUrl || patientData.avatar_url} alt="Avatar" className="w-full h-full object-cover group-hover:opacity-70 transition-opacity" />
                                                    ) : (
                                                        <User className="h-8 w-8 text-muted-foreground group-hover:opacity-70 transition-opacity" />
                                                    )}
                                                </div>
                                                <div className="absolute -bottom-2 -right-2 bg-background border rounded-full p-1.5 shadow-sm cursor-pointer hover:bg-muted transition-colors">
                                                    <Camera className="w-3 h-3 text-foreground" />
                                                </div>
                                                <input 
                                                    type="file" 
                                                    ref={fileInputRef} 
                                                    onChange={handlePhotoChange} 
                                                    className="hidden" 
                                                    accept="image/*"
                                                />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-semibold">Foto de Perfil</h4>
                                                <p className="text-xs text-muted-foreground max-w-xs cursor-pointer hover:underline" onClick={handlePhotoClick}>
                                                    Clique no ícone ou na foto para enviar uma nova (Max 5MB).
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="name">Nome Completo</Label>
                                                <Input id="name" {...register('name')} placeholder="Ex: Maria Silva" />
                                                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="email">E-mail</Label>
                                                <Input id="email" type="email" {...register('email')} disabled className="bg-muted/50" />
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
                                            <div className="space-y-2">
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
                                            <div className="space-y-2 md:col-span-2">
                                                <Label htmlFor="observations">Observações Livres</Label>
                                                <Textarea 
                                                    id="observations" 
                                                    {...register('observations')} 
                                                    placeholder="Notas gerais sobre o paciente, rotina, particularidades..."
                                                    className="resize-none h-20"
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>

                                    {/* TAB 2: FISICO */}
                                    <TabsContent value="body" className="mt-0 space-y-4">
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
                                                    Para alterar métricas específicas (pregas cutâneas, circunferências, bioimpedância) você deve utilizar o módulo completo.
                                                </p>
                                                <Button 
                                                    type="button" 
                                                    variant="outline" 
                                                    className="w-full bg-white dark:bg-background border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300" 
                                                    onClick={() => navigateToModule('anthropometry')}
                                                >
                                                    Ir para Módulo Corporal <ArrowRight className="w-4 h-4 ml-2" />
                                                </Button>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    {/* TAB 3: NUTRIÇÃO */}
                                    <TabsContent value="nutrition" className="mt-0 space-y-4">
                                        <div className="p-5 rounded-lg border-2 border-dashed border-[#a9b388] bg-[#fefae0]/30 dark:bg-[#a9b388]/10 text-center flex flex-col items-center gap-3">
                                            <div className="p-3 bg-[#a9b388]/20 dark:bg-[#a9b388]/30 rounded-full">
                                                <Utensils className="w-6 h-6 text-[#5f6f52] dark:text-[#a9b388]" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-semibold text-foreground">Gestão Nutricional</h4>
                                                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                                                    Crie dietas, calcule gatos energéticos e gerencie substituições diretamente nos módulos focados de alimentação.
                                                </p>
                                            </div>
                                            <Button 
                                                type="button" 
                                                className="mt-2 bg-[#5f6f52] hover:bg-[#4a5a3f] dark:text-white" 
                                                onClick={() => navigateToModule('meal-plan')}
                                            >
                                                Acessar Plano Alimentar
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    {/* TAB 4: MÓDULOS */}
                                    <TabsContent value="modules" className="mt-0 space-y-4">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                                                <div className="flex items-start gap-4 space-y-0 text-left w-full justify-between">
                                                    <div>
                                                        <Label className="text-base font-semibold flex items-center gap-2">
                                                            <Activity className="w-4 h-4 text-red-500" /> 
                                                            Controle Glicêmico
                                                        </Label>
                                                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                                            Habilita o módulo de registro de Destro (Glicemia de Jejum e Pós-prandial) nos painéis clínicos do paciente.
                                                        </p>
                                                    </div>
                                                    <Switch 
                                                        checked={isDiabeticValue}
                                                        onCheckedChange={(v) => setValue('is_diabetic', v)}
                                                        className="data-[state=checked]:bg-primary"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 opacity-60">
                                                <div className="flex items-start gap-4 space-y-0 text-left w-full justify-between">
                                                    <div>
                                                        <Label className="text-base font-semibold flex items-center gap-2">
                                                            Pressão Arterial <span className="text-[10px] bg-muted px-2 py-0.5 rounded ml-2">Em breve</span>
                                                        </Label>
                                                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                                            Rotina para pacientes hipertensos. Relatórios de sistólica e diastólica diárias.
                                                        </p>
                                                    </div>
                                                    <Switch disabled />
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </div>

                        <DialogFooter className="p-6 pt-4 border-t bg-muted/20 shrink-0">
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                            <Button type="submit" disabled={isSaving || isUploadingPhoto} className="bg-primary">
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Salvar Mudanças
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
