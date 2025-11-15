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
            .order(column, { ascending: ascending });

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
                className="max-w-4xl mx-auto w-full p-4 md:p-8" 
            >
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-8 mb-8">
                    
                    <div className="flex flex-col justify-center flex-1">
                        <h1 className="font-clash text-4xl sm:text-5xl font-semibold text-primary">
                            Meus Pacientes
                            <span className="text-3xl font-medium text-destructive ml-2">• {patients.length}</span>
                        </h1>
                        <p className="text-lg text-accent mt-2">
                            Gerencie, adicione ou visualize seus pacientes.
                        </p>
                    </div>

                    <div className="flex-shrink-0 mt-4 lg:mt-0">
                        <Button 
                            onClick={() => setShowAddPatientModal(true)} 
                            className="bg-primary text-primary-foreground rounded-5px shadow-card font-semibold hover:bg-primary/90 w-full lg:w-auto"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Paciente
                        </Button>
                    </div>
                </div>

                <Card className="bg-card shadow-card-dark rounded-xl">
                    <CardHeader>
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input 
                                    placeholder="Buscar por nome, email, CPF ou telefone..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 bg-muted"
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredPatients.length > 0 ? filteredPatients.map(patient => (
                                    <Link 
                                        to={`/nutritionist/patients/${patient.id}/hub`} 
                                        key={patient.id} 
                                        className="block p-4 border bg-background rounded-lg hover:shadow-lg hover:border-primary transition-all"
                                    >
                                        <div className="flex justify-between items-center gap-4">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center font-bold text-primary overflow-hidden">
                                                    {patient.avatar_url ? (
                                                        <img src={patient.avatar_url} alt={patient.name} className="w-full h-full object-cover"/>
                                                    ) : (
                                                        <UserIcon className="w-6 h-6 text-primary/70" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-lg text-foreground truncate">{patient.name}</h3>
                                                    <p className="text-sm text-muted-foreground truncate">
                                                        {patient.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <ChevronRight className="h-5 h-5 text-muted-foreground" />
                                        </div>
                                    </Link>
                                )) : (
                                    <p className="text-muted-foreground text-center py-8 md:col-span-2">
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