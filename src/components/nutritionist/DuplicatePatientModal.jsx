import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Loader2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { duplicatePatientTemporarily } from '@/utils/tempPatientCloner';
import { useAuth } from '@/contexts/AuthContext';

export const DuplicatePatientModal = ({ isOpen, onClose, patient }) => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState('selection'); // selection | cloning | success | error
    const [newPatientId, setNewPatientId] = useState(null);
    const [progressLogs, setProgressLogs] = useState([]);
    const [cloneName, setCloneName] = React.useState('');

    React.useEffect(() => {
        if (isOpen && patient?.name) {
            setCloneName(`(Cópia) ${patient.name}`);
        }
    }, [isOpen, patient]);
    
    const [options, setOptions] = useState({
        anthropometry: true,
        energy_expenditures: true,
        goals: true,
        lab_results: true,
        anamnesis_records: true,
        mealPlans: true
    });

    const handleOptionChange = (key, checked) => {
        setOptions(prev => ({ ...prev, [key]: checked }));
    };

    const handleStartCloning = async () => {
        if (!cloneName.trim()) return;

        setStep('cloning');
        setProgressLogs([]);
        
        const result = await duplicatePatientTemporarily(
            patient.id, 
            user.id, 
            { ...options, customName: cloneName }, 
            (log) => {
                setProgressLogs(prev => [...prev, log]);
            }
        );

        if (result.success) {
            setNewPatientId(result.newPatientId);
            setStep('success');
        } else {
            setStep('error');
        }
    };

    const handleClose = () => {
        if (step === 'cloning') return; // Bloquear fechamento enquanto clona
        setStep('selection');
        setProgressLogs([]);
        setNewPatientId(null);
        onClose();
    };

    const renderSelection = () => (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-yellow-600" />
                    Duplicar Paciente (Modo Teste)
                </DialogTitle>
                <DialogDescription>
                    Selecione quais módulos de dados você deseja copiar de <strong>{patient?.name}</strong>. O perfil básico sempre será copiado. O novo paciente será marcado como "(Cópia)".
                </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
                <div className="space-y-2 mb-4">
                    <Label htmlFor="clone-name">Nome da Cópia</Label>
                    <Input 
                        id="clone-name" 
                        value={cloneName} 
                        onChange={(e) => setCloneName(e.target.value)} 
                        placeholder="Ex: (Cópia) Nome" 
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <Checkbox id="opt-profile" checked disabled />
                    <Label htmlFor="opt-profile" className="opacity-70">Perfil e Dados Pessoais (Obrigatório)</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="opt-anthro" checked={options.anthropometry} onCheckedChange={(c) => handleOptionChange('anthropometry', c)} />
                    <Label htmlFor="opt-anthro">Antropometria (Medidas Corporais)</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="opt-energy" checked={options.energy_expenditures} onCheckedChange={(c) => handleOptionChange('energy_expenditures', c)} />
                    <Label htmlFor="opt-energy">Cálculos de Gasto Energético</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="opt-meal" checked={options.mealPlans} onCheckedChange={(c) => handleOptionChange('mealPlans', c)} />
                    <Label htmlFor="opt-meal">Planos Alimentares</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="opt-goals" checked={options.goals} onCheckedChange={(c) => handleOptionChange('goals', c)} />
                    <Label htmlFor="opt-goals">Metas</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="opt-labs" checked={options.lab_results} onCheckedChange={(c) => handleOptionChange('lab_results', c)} />
                    <Label htmlFor="opt-labs">Exames Laboratoriais</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="opt-anamnesis" checked={options.anamnesis_records} onCheckedChange={(c) => handleOptionChange('anamnesis_records', c)} />
                    <Label htmlFor="opt-anamnesis">Anamneses</Label>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button 
                    onClick={handleStartCloning} 
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    disabled={!cloneName.trim()}
                >
                    Iniciar Duplicação
                </Button>
            </DialogFooter>
        </>
    );

    const renderProgress = () => (
        <>
            <DialogHeader>
                <DialogTitle>Clonando Paciente...</DialogTitle>
                <DialogDescription>
                    Por favor, não feche esta janela até que a cópia seja concluída.
                </DialogDescription>
            </DialogHeader>

            <ScrollArea className="h-[250px] w-full rounded-md border p-4 bg-muted/30">
                <div className="space-y-3">
                    {progressLogs.map((log, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                            {log.status === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0 mt-0.5" />}
                            {log.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                            {log.status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                            <span className={log.status === 'error' ? 'text-red-600 font-medium' : 'text-foreground/80'}>
                                {log.text}
                            </span>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            <DialogFooter>
                {step === 'cloning' ? (
                    <Button disabled className="w-full">Clonando...</Button>
                ) : step === 'success' ? (
                    <Button onClick={() => navigate(`/nutritionist/patients/${newPatientId}/hub`)} className="w-full">
                        Ir para a Cópia
                    </Button>
                ) : (
                    <Button variant="outline" onClick={handleClose} className="w-full">Fechar (Houve um erro)</Button>
                )}
            </DialogFooter>
        </>
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-[425px]">
                {step === 'selection' && renderSelection()}
                {step !== 'selection' && renderProgress()}
            </DialogContent>
        </Dialog>
    );
};

export default DuplicatePatientModal;
