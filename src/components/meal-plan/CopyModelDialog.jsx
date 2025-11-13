import React, { useState, useEffect } from 'react';
import { Copy, Search, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';

const CopyModelDialog = ({ isOpen, onClose, planId, planName, onCopy }) => {
    const [patients, setPatients] = useState([]);
    const [filteredPatients, setFilteredPatients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [loading, setLoading] = useState(false);
    const [copying, setCopying] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadPatients();
        }
    }, [isOpen]);

    useEffect(() => {
        if (searchTerm) {
            const filtered = patients.filter(p =>
                p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.email?.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredPatients(filtered);
        } else {
            setFilteredPatients(patients);
        }
    }, [searchTerm, patients]);

    const loadPatients = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('user_profiles')
                .select('id, name, email')
                .eq('user_type', 'patient')
                .eq('nutritionist_id', user.id)
                .order('name', { ascending: true });

            if (error) throw error;
            setPatients(data || []);
            setFilteredPatients(data || []);
        } catch (error) {
            console.error('Erro ao carregar pacientes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!selectedPatient) return;

        setCopying(true);
        try {
            await onCopy(selectedPatient.id);
            handleClose();
        } catch (error) {
            console.error('Erro ao copiar modelo:', error);
        } finally {
            setCopying(false);
        }
    };

    const handleClose = () => {
        setSearchTerm('');
        setSelectedPatient(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Copiar Modelo de Dieta</DialogTitle>
                    <DialogDescription>
                        Selecione o paciente para aplicar o plano: <strong>{planName}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Busca */}
                    <div className="space-y-2">
                        <Label htmlFor="search">Buscar Paciente</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="search"
                                placeholder="Digite o nome ou email do paciente..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Lista de Pacientes */}
                    <ScrollArea className="h-[400px] border rounded-md p-4">
                        {loading && (
                            <div className="text-center py-8 text-muted-foreground">
                                Carregando pacientes...
                            </div>
                        )}

                        {!loading && filteredPatients.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                {searchTerm ? 'Nenhum paciente encontrado' : 'Você não tem pacientes cadastrados'}
                            </div>
                        )}

                        {!loading && filteredPatients.length > 0 && (
                            <div className="space-y-2">
                                {filteredPatients.map((patient) => (
                                    <div
                                        key={patient.id}
                                        className={`
                                            p-3 border rounded-lg cursor-pointer transition-colors
                                            ${selectedPatient?.id === patient.id
                                                ? 'bg-primary/10 border-primary'
                                                : 'hover:bg-muted'
                                            }
                                        `}
                                        onClick={() => setSelectedPatient(patient)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold">{patient.name}</h4>
                                                    {selectedPatient?.id === patient.id && (
                                                        <Check className="h-4 w-4 text-primary" />
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{patient.email}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={copying}>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button onClick={handleCopy} disabled={!selectedPatient || copying}>
                        <Copy className="h-4 w-4 mr-2" />
                        {copying ? 'Copiando...' : 'Copiar Modelo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default CopyModelDialog;
