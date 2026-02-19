import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, ChevronRight, User as UserIcon, Loader2, ListFilter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardHeader from '@/components/DashboardHeader';
import { motion } from 'framer-motion';
import AddPatientModal from '@/components/nutritionist/AddPatientModal';

// Objeto de ordenação
const sortOptions = {
    name_asc: { column: 'name', ascending: true, label: 'Ordem Alfabética (A-Z)' },
    created_at_desc: { column: 'created_at', ascending: false, label: 'Mais Recentes' },
    created_at_asc: { column: 'created_at', ascending: true, label: 'Mais Antigos' },
};

const PatientsPage = () => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [patients, setPatients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState('name_asc');
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);

    const fetchPatients = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        
        const { column, ascending } = sortOptions[sortOrder];

        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('nutritionist_id', user.id)
            .order(column, { ascending: ascending })
            .limit(500); // OTIMIZADO: Máximo 500 pacientes

        if (error) {
            console.error("Erro ao buscar pacientes:", error);
        } else {
            setPatients(data || []);
        }
        setLoading(false);
    }, [user?.id, sortOrder]); 

    useEffect(() => {
        fetchPatients();
    }, [fetchPatients]);

    const filteredPatients = useMemo(() => {
        if (!searchTerm.trim()) return patients;
        
        const lowerSearchTerm = searchTerm.toLowerCase();
        
        return patients.filter(p => 
            (p.name && p.name.toLowerCase().includes(lowerSearchTerm)) ||
            (p.email && p.email.toLowerCase().includes(lowerSearchTerm)) ||
            (p.phone && p.phone.includes(lowerSearchTerm)) ||
            (p.cpf && p.cpf.includes(lowerSearchTerm))
        );
    }, [patients, searchTerm]);


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
                            <div className="flex items-center gap-2">
                                <ListFilter className="w-4 h-4 text-muted-foreground" />
                                <Select value={sortOrder} onValueChange={setSortOrder}>
                                    <SelectTrigger className="w-full md:w-[200px] bg-muted">
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
                                    <Link
                                        to={`/nutritionist/patients/${patient.id}/hub`}
                                        key={patient.id}
                                        className="block p-4 border bg-background rounded-lg hover:shadow-lg hover:border-primary transition-all"
                                    >
                                        <div className="flex justify-between items-center gap-3">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center font-bold text-primary overflow-hidden flex-shrink-0">
                                                    {patient.avatar_url ? (
                                                        <img src={patient.avatar_url} alt={patient.name} className="w-full h-full object-cover"/>
                                                    ) : (
                                                        <UserIcon className="w-6 h-6 text-primary/70" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 overflow-hidden">
                                                    <h3 className="font-semibold text-base text-foreground truncate">{patient.name}</h3>
                                                    <p className="text-sm text-muted-foreground truncate">
                                                        {patient.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                        </div>
                                    </Link>
                                )) : (
                                    <p className="text-muted-foreground text-center py-8 md:col-span-2 lg:col-span-3">
                                        {searchTerm ? "Nenhum paciente encontrado." : "Você ainda não cadastrou nenhum paciente."}
                                    </p>
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