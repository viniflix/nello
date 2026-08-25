import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, XCircle, Clock, Plus, X, Pencil, Copy } from 'lucide-react';
import { duplicatePatientTemporarily } from '@/utils/tempPatientCloner';
import { useAuth } from '@/contexts/AuthContext';

export const DuplicatePatientModal = ({ isOpen, onClose, patient }) => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState('selection'); // selection | cloning | success | error
    const [newPatientId, setNewPatientId] = useState(null);
    
    const [globalOptions, setGlobalOptions] = useState({
        anthropometry: true,
        energy_expenditures: true,
        goals: true,
        lab_results: true,
        anamnesis_records: true,
        mealPlans: true
    });
    
    const [clones, setClones] = useState([
        { id: '1', name: '', customOptions: null }
    ]);
    const [expandedCloneId, setExpandedCloneId] = useState(null);

    const [progressLogs, setProgressLogs] = useState({}); // { 0: [], 1: [] }
    const [cloneStatuses, setCloneStatuses] = useState({}); // { 0: 'pending', 1: 'loading', 2: 'success' }
    const [currentCloneIndex, setCurrentCloneIndex] = useState(-1);

    React.useEffect(() => {
        if (isOpen && patient?.name) {
            setClones([{ id: Date.now().toString(), name: `(Cópia) ${patient.name}`, customOptions: null }]);
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

    const handleAddClone = () => {
        if (clones.length >= 10) return;
        setClones(prev => [
            ...prev, 
            { id: Date.now().toString(), name: `(Cópia ${prev.length + 1}) ${patient?.name || ''}`, customOptions: null }
        ]);
    };

    const handleRemoveClone = (id) => {
        if (clones.length <= 1) return;
        setClones(prev => prev.filter(c => c.id !== id));
    };

    const handleNameChange = (id, newName) => {
        setClones(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c));
    };

    const handleToggleCustomOptions = (id) => {
        setExpandedCloneId(prev => prev === id ? null : id);
        setClones(prev => prev.map(c => {
            if (c.id === id && !c.customOptions) {
                return { ...c, customOptions: { ...globalOptions } };
            }
            return c;
        }));
    };

    const handleClearCustomOptions = (id) => {
        setClones(prev => prev.map(c => c.id === id ? { ...c, customOptions: null } : c));
        if (expandedCloneId === id) setExpandedCloneId(null);
    };

    const handleCustomOptionChange = (id, key, checked) => {
        setClones(prev => prev.map(c => {
            if (c.id === id && c.customOptions) {
                return { ...c, customOptions: { ...c.customOptions, [key]: checked } };
            }
            return c;
        }));
    };

    const getCloneTotalSteps = (opts) => {
        // 2 baselines: Buscando dados + Criando perfil
        return 2 + 
            (opts.anthropometry ? 1 : 0) + 
            (opts.energy_expenditures ? 1 : 0) + 
            (opts.mealPlans ? 1 : 0) + 
            (opts.goals ? 1 : 0) + 
            (opts.lab_results ? 1 : 0) + 
            (opts.anamnesis_records ? 1 : 0);
    };

    const handleStartCloning = async () => {
        if (clones.some(c => !c.name.trim())) return;

        setStep('cloning');
        setProgressLogs({});
        setCloneStatuses({});
        
        let allSuccess = true;
        let lastNewPatientId = null;

        for (let i = 0; i < clones.length; i++) {
            const clone = clones[i];
            setCurrentCloneIndex(i);
            setCloneStatuses(prev => ({ ...prev, [i]: 'loading' }));
            setProgressLogs(prev => ({ ...prev, [i]: [] }));

            const optsToUse = clone.customOptions || globalOptions;

            const result = await duplicatePatientTemporarily(
                patient.id, 
                user.id, 
                { ...optsToUse, customName: clone.name }, 
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
            
            setTimeout(() => {
                handleClose();
                window.location.reload();
            }, 1500);
        } else {
            setStep('error');
        }
    };

    const handleClose = () => {
        if (step === 'cloning') return;
        setStep('selection');
        setProgressLogs({});
        setCloneStatuses({});
        setCurrentCloneIndex(-1);
        setNewPatientId(null);
        setExpandedCloneId(null);
        onClose();
    };

    const renderOptionsGrid = (optionsObj, onChange) => (
        <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="flex items-center space-x-2 opacity-70">
                <Checkbox checked disabled />
                <Label className="text-xs">Perfil e Pessoais</Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox checked={optionsObj.anthropometry} onCheckedChange={(c) => onChange('anthropometry', c)} />
                <Label className="text-xs">Antropometria</Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox checked={optionsObj.energy_expenditures} onCheckedChange={(c) => onChange('energy_expenditures', c)} />
                <Label className="text-xs">Gasto Energético</Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox checked={optionsObj.mealPlans} onCheckedChange={(c) => onChange('mealPlans', c)} />
                <Label className="text-xs">Planos Alimentares</Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox checked={optionsObj.goals} onCheckedChange={(c) => onChange('goals', c)} />
                <Label className="text-xs">Metas</Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox checked={optionsObj.lab_results} onCheckedChange={(c) => onChange('lab_results', c)} />
                <Label className="text-xs">Exames</Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox checked={optionsObj.anamnesis_records} onCheckedChange={(c) => onChange('anamnesis_records', c)} />
                <Label className="text-xs">Anamneses</Label>
            </div>
        </div>
    );

    const renderSelection = () => (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Copy className="w-5 h-5 text-yellow-600" />
                    Duplicar Paciente
                </DialogTitle>
                <DialogDescription>
                    Configure as cópias e os dados que devem ser transferidos de <strong>{patient?.name}</strong>.
                </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-4">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Nomes das Cópias</Label>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 gap-1 text-xs" 
                            onClick={handleAddClone}
                            disabled={clones.length >= 10}
                        >
                            <Plus className="w-3.5 h-3.5" /> Paciente
                        </Button>
                    </div>

                    <ScrollArea className="max-h-[220px] pr-3">
                        <div className="space-y-3">
                            {clones.map((clone, idx) => (
                                <div key={clone.id} className={`p-3 border rounded-md transition-all ${clone.customOptions ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20' : 'bg-background'}`}>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            value={clone.name} 
                                            onChange={(e) => handleNameChange(clone.id, e.target.value)} 
                                            placeholder={`Ex: (Cópia ${idx + 1}) Nome`}
                                            className="h-9"
                                        />
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className={`h-9 w-9 shrink-0 ${clone.customOptions ? 'text-amber-600 bg-amber-100/50' : 'text-muted-foreground hover:text-foreground'}`}
                                            onClick={() => handleToggleCustomOptions(clone.id)}
                                            title="Configurar módulos individuais"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleRemoveClone(clone.id)}
                                            disabled={clones.length === 1}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    
                                    {clone.customOptions && (
                                        <div className="mt-2 flex items-center justify-between">
                                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                                Personalizado
                                            </Badge>
                                            <Button variant="link" className="h-auto p-0 text-[10px] text-muted-foreground" onClick={() => handleClearCustomOptions(clone.id)}>
                                                Usar padrão
                                            </Button>
                                        </div>
                                    )}

                                    {expandedCloneId === clone.id && clone.customOptions && (
                                        <div className="mt-2 pt-2 border-t border-amber-200/50">
                                            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">O que copiar nesta cópia:</p>
                                            {renderOptionsGrid(clone.customOptions, (k, v) => handleCustomOptionChange(clone.id, k, v))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                <div className="p-3 bg-muted/40 border rounded-md">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                        Configuração Padrão
                        <span className="text-[10px] font-normal text-muted-foreground">(Aplica-se às cópias não personalizadas)</span>
                    </Label>
                    {renderOptionsGrid(globalOptions, (k, v) => setGlobalOptions(prev => ({ ...prev, [k]: v })))}
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button 
                    onClick={handleStartCloning} 
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    disabled={clones.some(c => !c.name.trim())}
                >
                    Iniciar Duplicação
                </Button>
            </DialogFooter>
        </>
    );

    const renderProgress = () => (
        <>
            <DialogHeader>
                <DialogTitle>Clonando Pacientes...</DialogTitle>
                <DialogDescription>
                    Por favor, não feche esta janela até que a cópia seja concluída.
                </DialogDescription>
            </DialogHeader>

            <ScrollArea className="h-[300px] w-full rounded-md border p-3 bg-muted/10">
                <div className="space-y-3">
                    {clones.map((clone, idx) => {
                        const status = cloneStatuses[idx] || 'pending';
                        const logs = progressLogs[idx] || [];
                        const isCurrent = currentCloneIndex === idx;
                        
                        const optsToUse = clone.customOptions || globalOptions;
                        const totalSteps = getCloneTotalSteps(optsToUse);
                        const completedSteps = logs.filter(l => l.status === 'success' || l.status === 'error').length;
                        const progressPercent = Math.min(100, Math.round((completedSteps / totalSteps) * 100));
                        
                        const lastLog = logs[logs.length - 1];

                        return (
                            <div key={clone.id} className={`p-3 rounded-md border transition-all ${isCurrent ? 'bg-background border-blue-200 shadow-sm' : 'bg-transparent border-transparent'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {status === 'pending' && <Clock className="w-4 h-4 text-muted-foreground shrink-0" />}
                                        {status === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                                        {status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                        {status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                                        
                                        <span className={`font-medium text-sm ${status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
                                            {clone.name}
                                        </span>
                                    </div>
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        {status === 'pending' ? 'Aguardando' : `${progressPercent}%`}
                                    </span>
                                </div>
                                
                                <Progress 
                                    value={status === 'pending' ? 0 : status === 'error' ? 100 : progressPercent} 
                                    className={`h-1.5 mb-2 ${status === 'error' ? 'bg-red-100' : ''}`}
                                    indicatorClassName={status === 'success' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-blue-500'}
                                />

                                {(isCurrent || status === 'error') && lastLog && (
                                    <div className="flex items-start gap-1.5 text-[11px]">
                                        {lastLog.status === 'loading' && <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0 mt-0.5" />}
                                        {lastLog.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />}
                                        {lastLog.status === 'error' && <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />}
                                        <span className={`truncate ${lastLog.status === 'error' ? 'text-red-600 font-medium whitespace-normal' : 'text-muted-foreground'}`}>
                                            {lastLog.text}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>

            <DialogFooter>
                {step === 'cloning' ? (
                    <Button disabled className="w-full">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Clonando {currentCloneIndex + 1} de {clones.length}...
                    </Button>
                ) : step === 'success' ? (
                    <Button disabled className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Concluído! Atualizando...
                    </Button>
                ) : (
                    <Button variant="outline" onClick={handleClose} className="w-full text-red-600">Fechar (Houve um erro)</Button>
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
