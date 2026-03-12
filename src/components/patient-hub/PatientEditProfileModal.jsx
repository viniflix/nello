import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getAnthropometryRecords, createAnthropometryRecord } from '@/lib/supabase/anthropometry-queries';
import { updatePatientProfile } from '@/lib/supabase/patient-queries';

const profileSchema = z.object({
    height: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(30, "Altura inválida").max(300, "Altura inválida").optional()),
    weight: z.preprocess((val) => (val === '' ? undefined : Number(val)), z.number().min(2, "Peso inválido").max(500, "Peso inválido").optional()),
    gender: z.string().optional(),
    goal: z.string().optional(),
});

const PatientEditProfileModal = ({ isOpen, onClose, patientData, onSaveSuccess }) => {
    const [step, setStep] = useState('form'); // 'form' | 'warning'
    const [isSaving, setIsSaving] = useState(false);
    const [pendingData, setPendingData] = useState(null);

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            height: '',
            weight: '',
            gender: '',
            goal: ''
        }
    });

    useEffect(() => {
        if (isOpen && patientData) {
            reset({
                height: patientData.height || '',
                weight: patientData.weight || '',
                gender: patientData.gender || '',
                goal: patientData.goal || ''
            });
            setStep('form');
            setPendingData(null);
        }
    }, [isOpen, patientData, reset]);

    const onSubmit = async (data) => {
        setIsSaving(true);
        try {
            // Verificar se o paciente já tem evolução física
            const { data: records, error } = await getAnthropometryRecords(patientData.id, { limit: 1 });
            
            if (error) throw error;

            if (records && records.length > 0) {
                // Tem registros -> mostramos o warning
                setPendingData(data);
                setStep('warning');
            } else {
                // Não tem registros -> Fluxo Virgem
                await performSave(data, true);
            }
        } catch (error) {
            console.error("Erro ao verificar registros:", error);
            // Mostrar toast de erro num app real
        } finally {
            setIsSaving(false);
        }
    };

    const performSave = async (data, createEvolution = false) => {
        setIsSaving(true);
        try {
            const updatePayload = {
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
                    notes: "Registro inicial via Edição de Perfil"
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
            <DialogContent className="sm:max-w-[425px]">
                {step === 'form' ? (
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>Editar Perfil</DialogTitle>
                            <DialogDescription>
                                Atualize os dados físicos e objetivos centrais do paciente.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="height">Altura (cm)</Label>
                                <Input id="height" type="number" step="0.1" {...register('height')} placeholder="Ex: 175" />
                                {errors.height && <p className="text-xs text-destructive">{errors.height.message}</p>}
                            </div>
                            
                            <div className="grid gap-2">
                                <Label htmlFor="weight">Peso Atual (kg)</Label>
                                <Input id="weight" type="number" step="0.1" {...register('weight')} placeholder="Ex: 70.5" />
                                {errors.weight && <p className="text-xs text-destructive">{errors.weight.message}</p>}
                            </div>

                            <div className="grid gap-2">
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

                            <div className="grid gap-2">
                                <Label htmlFor="goal">Objetivo Principal</Label>
                                <select 
                                    id="goal" 
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
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Salvar
                            </Button>
                        </DialogFooter>
                    </form>
                ) : (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-warning" />
                                <DialogTitle>Atenção aos Dados</DialogTitle>
                            </div>
                            <DialogDescription className="pt-2">
                                Já existem dados antropométricos cadastrados para este paciente. 
                                Deseja que esta atualização crie um <strong>novo registro de evolução</strong> com a data de hoje?
                            </DialogDescription>
                        </DialogHeader>

                        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
                            <Button 
                                type="button" 
                                variant="outline" 
                                className="w-full sm:w-auto"
                                onClick={() => performSave(pendingData, false)} 
                                disabled={isSaving}
                            >
                                Não, apenas alterar perfil
                            </Button>
                            <Button 
                                type="button" 
                                variant="default"
                                className="w-full sm:w-auto"
                                onClick={() => performSave(pendingData, true)} 
                                disabled={isSaving}
                            >
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sim, criar nova evolução"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default PatientEditProfileModal;
