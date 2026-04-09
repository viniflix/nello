import React, { useState, useEffect } from 'react';
import { Search, X, Check, Send } from 'lucide-react';
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
import { GradientAvatar } from '@/components/nutritionist/PatientCard';

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
                p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.phone?.includes(searchTerm)
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
                .select('id, name, email, phone, avatar_url')
                .eq('user_type', 'patient')
                .eq('nutritionist_id', user.id)
                .eq('is_active', true)
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
            console.error('Erro ao enviar plano:', error);
        } finally {
            setCopying(false);
        }
    };

    const handleClose = () => {
        setSearchTerm('');
        setSelectedPatient(null);
        onClose();
    };

    const formatPhone = (phone) => {
        if (!phone) return null;
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 11) {
            return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
        }
        return phone;
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-primary" />
                        Enviar Plano para Paciente
                    </DialogTitle>
                    <DialogDescription>
                        Selecione o paciente que receberá uma cópia do plano: <strong>{planName}</strong>
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
                                placeholder="Nome, email ou telefone..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Lista de Pacientes */}
                    <ScrollArea className="h-[400px] border rounded-md p-3">
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
                                            p-3 border rounded-lg cursor-pointer transition-all duration-150
                                            ${selectedPatient?.id === patient.id
                                                ? 'bg-primary/10 border-primary shadow-sm'
                                                : 'hover:bg-muted/50 hover:border-border'
                                            }
                                        `}
                                        onClick={() => setSelectedPatient(patient)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <GradientAvatar
                                                name={patient.name}
                                                avatarUrl={patient.avatar_url}
                                                size={40}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-sm truncate">{patient.name}</h4>
                                                    {selectedPatient?.id === patient.id && (
                                                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                                            <Check className="h-3 w-3 text-primary-foreground" />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">{patient.email}</p>
                                                {patient.phone && (
                                                    <p className="text-xs text-muted-foreground">{formatPhone(patient.phone)}</p>
                                                )}
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
                        <Send className="h-4 w-4 mr-2" />
                        {copying ? 'Enviando...' : 'Enviar Plano'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default CopyModelDialog;
