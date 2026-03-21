import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, ChevronRight, User as UserIcon, Loader2, ListFilter, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardHeader from '@/components/DashboardHeader';
import { motion } from 'framer-motion';
import AddPatientModal from '@/components/nutritionist/AddPatientModal';
import { usePatientFormStore } from '@/stores/usePatientFormStore'; 
import { fetchAllNutritionistPatients, archivePatient, hardDeletePatient, unarchivePatient } from '@/lib/supabase/patient-queries';
import PatientCard from '@/components/nutritionist/PatientCard';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';
import { useToast } from '@/components/ui/use-toast';

// Objeto de ordenação
const sortOptions = {
    name_asc: { column: 'name', ascending: true, label: 'Ordem Alfabética (A-Z)' },
    created_at_desc: { column: 'created_at', ascending: false, label: 'Mais Recentes' },
    created_at_asc: { column: 'created_at', ascending: true, label: 'Mais Antigos' },
};

const PatientsPage = () => {
    const { user } = useAuth();
    const [patients, setPatients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState('name_asc');
    const [filterStatus, setFilterStatus] = useState('active'); // 'all', 'active', 'archived', 'pending', 'online'
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const { updateField } = usePatientFormStore();
    const { toast } = useToast();
    const { isUserOnline } = useOnlinePresence();

    // Handle auto-open and auto-fill from URL params
    useEffect(() => {
        const addPatientName = searchParams.get('addPatientName');
        if (addPatientName) {
            setShowAddPatientModal(true);
            updateField('name', addPatientName);
            // Remove o param da URL para não reabrir em recarregamentos
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams, updateField]);

    const fetchPatients = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        
        const { active, archived, error } = await fetchAllNutritionistPatients(user.id);

        if (error) {
            console.error("Erro ao buscar pacientes:", error);
            toast({ title: "Erro de Conexão", description: "Não foi possível carregar os pacientes.", variant: "destructive" });
        } else {
            setPatients([...active, ...archived]);
        }
        setLoading(false);
    }, [user?.id, toast]); 

    useEffect(() => {
        fetchPatients();
    }, [fetchPatients]);

    const handleArchive = async (patient) => {
        toast({ title: "Aguarde", description: "Arquivando paciente..." });
        const { success, error } = await archivePatient(patient.id, user.id);
        if (success) {
            toast({ title: "Paciente Arquivado", description: "O chat e modo de edição foram bloqueados.", variant: "success" });
            fetchPatients();
        } else {
            toast({ title: "Erro", description: "Não foi possível arquivar o paciente.", variant: "destructive" });
        }
    };

    const handleUnarchive = async (patient) => {
        toast({ title: "Aguarde", description: "Reativando paciente..." });
        const { success, error } = await unarchivePatient(patient.id, user.id);
        if (success) {
            toast({ title: "Paciente Reativado", description: "A comunicação e os dados do paciente foram reestabelecidos.", variant: "success" });
            fetchPatients();
        } else {
            toast({ title: "Aviso", description: "Pode ser que o paciente já tenha sido vinculado a outro nutricionista.", variant: "destructive" });
        }
    };

    const handleDelete = async (patient) => {
        toast({ title: "Aguarde", description: "Excluindo paciente..." });
        const { success, error } = await hardDeletePatient(patient.id);
        if (success) {
            toast({ title: "Conta Excluída", description: "Paciente e e-mail liberados permanentemente.", variant: "success" });
            fetchPatients();
        } else {
            toast({ title: "Erro", description: "Não foi possível excluir. Talvez existam dados remanescentes.", variant: "destructive" });
        }
    };

    const filteredPatients = useMemo(() => {
        let result = patients;

        const getPriority = (p) => {
            const isArchived = p.is_active === false || p.arquivadoHistorico;
            const isPending = p.needs_password_reset === true && !isArchived;
            if (isArchived) return 4;
            if (isPending) return 3;
            if (isUserOnline(p.id)) return 1;
            return 2; // Active Offline
        };

        // Se houver busca de texto, ignora o filtro visual selecionado,
        // retorna TODOS os pacientes que deram match e ordena pela prioridade.
        if (searchTerm.trim()) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            result = result.filter(p => 
                (p.name && p.name.toLowerCase().includes(lowerSearchTerm)) ||
                (p.email && p.email.toLowerCase().includes(lowerSearchTerm)) ||
                (p.phone && p.phone.includes(lowerSearchTerm)) ||
                (p.cpf && p.cpf.includes(lowerSearchTerm))
            );

            // Ordena pela prioridade exigida na busca
            result.sort((a, b) => getPriority(a) - getPriority(b));
            return result;
        }

        // Sem busca de texto, aplica Filtro Normal
        if (filterStatus === 'active') {
            result = result.filter(p => p.is_active !== false && !p.arquivadoHistorico);
        } else if (filterStatus === 'archived') {
            result = result.filter(p => p.is_active === false || p.arquivadoHistorico);
        } else if (filterStatus === 'pending') {
            result = result.filter(p => p.needs_password_reset === true && p.is_active !== false && !p.arquivadoHistorico);
        } else if (filterStatus === 'online') {
            result = result.filter(p => isUserOnline(p.id) && p.is_active !== false && !p.arquivadoHistorico);
        }

        // Ordenação normal quando não há busca por texto
        const { column, ascending } = sortOptions[sortOrder];
        result.sort((a, b) => {
            const valA = a[column];
            const valB = b[column];
            if (!valA) return ascending ? 1 : -1;
            if (!valB) return ascending ? -1 : 1;
            if (valA < valB) return ascending ? -1 : 1;
            if (valA > valB) return ascending ? 1 : -1;
            return 0;
        });

        return result;
    }, [patients, searchTerm, filterStatus, sortOrder, isUserOnline]);


    return (
        <div className="flex flex-col min-h-screen bg-background">

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-4 md:pt-8 min-w-0 overflow-x-hidden"
            >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">

                    <div className="flex flex-col justify-center flex-1 min-w-0 text-center sm:text-left">
                        <h1 className="text-2xl md:text-3xl font-bold font-heading uppercase tracking-wide text-primary break-words">
                            Meus Pacientes
                            <span className="text-2xl md:text-3xl font-medium text-destructive ml-1 md:ml-2">• {patients.length}</span>
                        </h1>
                        <p className="text-neutral-600 mt-1 text-sm md:text-base">
                            Gerencie, adicione ou visualize seus pacientes.
                        </p>
                    </div>

                    <div className="flex-shrink-0 flex justify-center sm:justify-end">
                        <Button
                            onClick={() => setShowAddPatientModal(true)}
                            className="bg-primary text-primary-foreground rounded-5px shadow-card font-semibold hover:bg-primary/90"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Paciente
                        </Button>
                    </div>
                </div>

                <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 shrink-0" />
                                <Input
                                    placeholder="Buscar por nome, email, CPF ou telefone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 bg-muted min-w-0"
                                />
                            </div>
                            <div className="flex flex-col md:flex-row items-center gap-2">
                                <ListFilter className="w-4 h-4 text-muted-foreground hidden md:block" />
                                <Select value={filterStatus} onValueChange={setFilterStatus}>
                                    <SelectTrigger className="w-full md:w-[160px] bg-muted">
                                        <SelectValue placeholder="Filtrar por..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os Pacientes</SelectItem>
                                        <SelectItem value="active">Em Tratamento</SelectItem>
                                        <SelectItem value="online">Apenas Online</SelectItem>
                                        <SelectItem value="pending">Convite Pendente</SelectItem>
                                        <SelectItem value="archived">Arquivados</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={sortOrder} onValueChange={setSortOrder}>
                                    <SelectTrigger className="w-full md:w-[190px] bg-muted">
                                        <SelectValue placeholder="Ordenar por..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(sortOptions).map(([key, { label }]) => (
                                            <SelectItem key={key} value={key}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center items-center h-40">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredPatients.length > 0 ? filteredPatients.map(patient => (
                                    <PatientCard 
                                        key={patient.id} 
                                        patient={patient} 
                                        isOnline={isUserOnline(patient.id)}
                                        onArchive={handleArchive}
                                        onUnarchive={handleUnarchive}
                                        onDelete={handleDelete}
                                    />
                                )) : (
                                    <div className="text-center py-12 md:col-span-2 lg:col-span-3">
                                        <Users className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                                        <h3 className="text-lg font-medium text-foreground">
                                            {searchTerm || filterStatus !== 'all' ? "Nenhum paciente encontrado com estes filtros." : "Você ainda não cadastrou nenhum paciente."}
                                        </h3>
                                        <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
                                            Tente alterar os termos de busca, limpar os filtros ou criar um novo paciente.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            <AddPatientModal
                isOpen={showAddPatientModal}
                setIsOpen={setShowAddPatientModal}
                onPatientAdded={fetchPatients} // Para recarregar a lista
            />
        </div>
    );
};

export default PatientsPage;