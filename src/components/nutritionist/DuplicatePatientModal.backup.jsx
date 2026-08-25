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
    const [numberOfCopies, setNumberOfCopies] = useState(1);
    const [cloneNames, setCloneNames] = useState(['']); 
    const [progressLogs, setProgressLogs] = useState({}); // { 0: [], 1: [] }
    const [cloneStatuses, setCloneStatuses] = useState({}); // { 0: 'pending', 1: 'loading', 2: 'success' }
    const [currentCloneIndex, setCurrentCloneIndex] = useState(-1);

    React.useEffect(() => {
        if (isOpen && patient?.name) {
            setCloneNames(prev => {
                if (prev[0] === '' && prev.length === 1) {
                    return [`(Cópia) ${patient.name}`];
                }
                return prev;
            });
        }
    }, [isOpen, patient]);

    // Prevenir recarregamento acidental da página durante a cópia
    React.useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (step === 'cloning') {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [step]);
    
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

    const handleNumberOfCopiesChange = (val) => {
        const num = Math.min(10, Math.max(1, parseInt(val) || 1));
        setNumberOfCopies(num);
        
        setCloneNames(prev => {
            const newNames = [...prev];
            for (let i = 0; i < num; i++) {
                if (!newNames[i]) {
                    newNames[i] = num === 1 ? `(Cópia) ${patient?.name || ''}` : `(Cópia ${i + 1}) ${patient?.name || ''}`;
                }
            }
            if (prev.length === 1 && num > 1 && prev[0] === `(Cópia) ${patient?.name || ''}`) {
                newNames[0] = `(Cópia 1) ${patient?.name || ''}`;
            } else if (prev.length > 1 && num === 1 && prev[0] === `(Cópia 1) ${patient?.name || ''}`) {
                newNames[0] = `(Cópia) ${patient?.name || ''}`;
            }
            return newNames.slice(0, num);
        });
    };

    const handleStartCloning = async () => {
        if (cloneNames.some(name => !name.trim())) return;

        setStep('cloning');
        setProgressLogs({});
        setCloneStatuses({});
        
        let allSuccess = true;
        let lastNewPatientId = null;

        for (let i = 0; i < numberOfCopies; i++) {
            setCurrentCloneIndex(i);
            setCloneStatuses(prev => ({ ...prev, [i]: 'loading' }));
            setProgressLogs(prev => ({ ...prev, [i]: [] }));

            const result = await duplicatePatientTemporarily(
                patient.id, 
                user.id, 
                { ...options, customName: cloneNames[i] }, 
                (log) => {
                    setProgressLogs(prev => ({
                        ...prev,
                        [i]: [...(prev[i] || []), log]
                    }));
                }
            );

            if (result.success) {
                lastNewPatientId = result.newPatientId;
                setCloneStatuses(prev => ({ ...prev, [i]: 'success' }));
            } else {
                allSuccess = false;
                setCloneStatuses(prev => ({ ...prev, [i]: 'error' }));
                break; // Interrompe as próximas cópias se der erro fatal
            }
        }

        if (allSuccess) {
            setNewPatientId(lastNewPatientId);
            setStep('success');
            
            // Fecha o modal automaticamente e recarrega a página para atualizar a listagem
            setTimeout(() => {
                handleClose();
                window.location.reload();
            }, 1500);
        } else {
            setStep('error');
        }
    };

    const handleClose = () => {
        if (step === 'cloning') return; // Bloquear fechamento enquanto clona
        setStep('selection');
        setProgressLogs({});
        setCloneStatuses({});
        setCurrentCloneIndex(-1);
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
                <div className="space-y-4 mb-4 bg-muted/30 p-3 rounded-md border">
                    <div className="space-y-2">
                        <Label htmlFor="num-copies">Quantidade de Cópias (Máx 10)</Label>
                        <Input 
                            id="num-copies"
                            type="number"
                            min={1}
                            max={10}
                            value={numberOfCopies}
                            onChange={(e) => handleNumberOfCopiesChange(e.target.value)}
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Nomes das Cópias</Label>
                        <div className="max-h-[160px] overflow-y-auto pr-2 space-y-2">
                            {cloneNames.map((name, idx) => (
                                <Input 
                                    key={idx}
                                    value={name} 
                                    onChange={(e) => {
                                        const newNames = [...cloneNames];
                                        newNames[idx] = e.target.value;
                                        setCloneNames(newNames);
                                    }} 
                                    placeholder={`Ex: (Cópia ${idx + 1}) Nome`} 
                                />
                            ))}
                        </div>
                    </div>
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
                    disabled={cloneNames.some(name => !name.trim())}
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

            <ScrollArea className="h-[300px] w-full rounded-md border p-4 bg-muted/30">
                <div className="space-y-3">
                    {Array.from({ length: numberOfCopies }).map((_, idx) => {
                        const status = cloneStatuses[idx] || 'pending';
                        const logs = progressLogs[idx] || [];
                        const isCurrent = currentCloneIndex === idx;
                        
                        return (
                            <div key={idx} className={`p-3 rounded-md border transition-colors ${isCurrent ? 'bg-background border-blue-200 shadow-sm' : 'bg-transparent border-transparent'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    {status === 'pending' && <Clock className="w-4 h-4 text-muted-foreground shrink-0" />}
                                    {status === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                                    {status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                    {status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                                    
                                    <span className={`font-medium ${status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
                                        {cloneNames[idx]}
                                    </span>
                                </div>
                                
                                {/* Mostra detalhes apenas se estiver processando agora ou se houve erro */}
                                {(isCurrent || status === 'error') && logs.length > 0 && (
                                    <div className="pl-6 space-y-1.5 mt-2">
                                        {logs.map((log, logIdx) => (
                                            <div key={logIdx} className="flex items-start gap-2 text-xs">
                                                {log.status === 'loading' && <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0 mt-0.5" />}
                                                {log.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />}
                                                {log.status === 'error' && <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />}
                                                <span className={log.status === 'error' ? 'text-red-600 font-medium' : 'text-foreground/70'}>
                                                    {log.text}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>

            <DialogFooter>
                {step === 'cloning' ? (
                    <Button disabled className="w-full">Clonando...</Button>
                ) : step === 'success' ? (
                    <Button disabled className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                        Concluído! Atualizando...
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
