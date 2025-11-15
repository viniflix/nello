import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Utensils, Weight, Loader2, Edit3, Search, X, Filter } from 'lucide-react';

/**
 * Widget que mostra TODOS os registros DOS PACIENTES com filtros e pesquisa
 */
const PatientUpdatesWidget = () => {
    const [allUpdates, setAllUpdates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'meal', 'weight', 'edit'
    const { user } = useAuth();

    useEffect(() => {
        const fetchUpdates = async () => {
            if (!user?.id) return;

            setLoading(true);

            try {
                // Buscar pacientes do nutricionista
                const { data: patientsData } = await supabase
                    .from('user_profiles')
                    .select('id, name')
                    .eq('nutritionist_id', user.id)
                    .eq('user_type', 'patient');

                if (!patientsData || patientsData.length === 0) {
                    setAllUpdates([]);
                    setLoading(false);
                    return;
                }

                const patientIds = patientsData.map(p => p.id);
                const patientMap = Object.fromEntries(patientsData.map(p => [p.id, p]));

                const activities = [];

                // Buscar TODAS as atividades (sem limite)
                const [mealsData, editsData, weightData] = await Promise.all([
                    // 1. REFEIÇÕES
                    supabase
                        .from('meals')
                        .select('id, patient_id, meal_type, total_calories, created_at')
                        .in('patient_id', patientIds)
                        .order('created_at', { ascending: false }),

                    // 2. EDIÇÕES DE REFEIÇÃO
                    supabase
                        .from('meal_edit_history')
                        .select('id, patient_id, edited_at')
                        .in('patient_id', patientIds)
                        .order('edited_at', { ascending: false }),

                    // 3. PESO REGISTRADO
                    supabase
                        .from('growth_records')
                        .select('id, patient_id, weight, created_at')
                        .in('patient_id', patientIds)
                        .order('created_at', { ascending: false })
                ]);

                // Processar REFEIÇÕES
                if (mealsData.data) {
                    mealsData.data.forEach(meal => {
                        const patient = patientMap[meal.patient_id];
                        if (patient) {
                            activities.push({
                                id: `meal-${meal.id}`,
                                type: 'meal',
                                patient_name: patient.name,
                                description: `registrou ${meal.meal_type}`,
                                detail: `${meal.total_calories || 0} kcal`,
                                timestamp: meal.created_at
                            });
                        }
                    });
                }

                // Processar EDIÇÕES
                if (editsData.data) {
                    editsData.data.forEach(edit => {
                        const patient = patientMap[edit.patient_id];
                        if (patient) {
                            activities.push({
                                id: `edit-${edit.id}`,
                                type: 'edit',
                                patient_name: patient.name,
                                description: 'editou uma refeição',
                                detail: '',
                                timestamp: edit.edited_at
                            });
                        }
                    });
                }

                // Processar PESO
                if (weightData.data) {
                    weightData.data.forEach(record => {
                        const patient = patientMap[record.patient_id];
                        if (patient) {
                            activities.push({
                                id: `weight-${record.id}`,
                                type: 'weight',
                                patient_name: patient.name,
                                description: 'registrou peso',
                                detail: `${record.weight} kg`,
                                timestamp: record.created_at
                            });
                        }
                    });
                }

                // Ordenar por timestamp
                activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                setAllUpdates(activities);

            } catch (error) {
                console.error('Erro ao buscar atualizações:', error);
                setAllUpdates([]);
            }

            setLoading(false);
        };

        fetchUpdates();
    }, [user]);

    const getIcon = (type) => {
        switch (type) {
            case 'meal':
                return <Utensils className="h-5 w-5 text-secondary" />;
            case 'weight':
                return <Weight className="h-5 w-5 text-primary" />;
            case 'edit':
                return <Edit3 className="h-5 w-5 text-neutral-600" />;
            default:
                return null;
        }
    };

    // Aplicar filtros
    const filteredUpdates = allUpdates.filter(update => {
        // Filtro por tipo
        if (activeFilter !== 'all' && update.type !== activeFilter) {
            return false;
        }

        // Filtro por pesquisa
        if (searchTerm && !update.patient_name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }

        return true;
    });

    if (loading) {
        return (
            <Card className="bg-card shadow-card-dark rounded-xl">
                <CardHeader>
                    <CardTitle className="font-clash text-lg font-semibold text-primary">
                        Registros Recentes
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Carregando...
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader className="pb-3">
                <CardTitle className="font-clash text-lg font-semibold text-primary">
                    Registros Recentes
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                    Últimos registros dos seus pacientes
                </CardDescription>

                {/* Campo de Pesquisa com Dropdown de Filtros */}
                <div className="flex gap-2 mt-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Pesquisar por paciente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-9"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Dropdown de Filtros */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                                <Filter className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setActiveFilter('all')}>
                                <span className={activeFilter === 'all' ? 'font-semibold' : ''}>
                                    Todos
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setActiveFilter('meal')}>
                                <Utensils className="h-4 w-4 mr-2" />
                                <span className={activeFilter === 'meal' ? 'font-semibold' : ''}>
                                    Refeições
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setActiveFilter('weight')}>
                                <Weight className="h-4 w-4 mr-2" />
                                <span className={activeFilter === 'weight' ? 'font-semibold' : ''}>
                                    Peso
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setActiveFilter('edit')}>
                                <Edit3 className="h-4 w-4 mr-2" />
                                <span className={activeFilter === 'edit' ? 'font-semibold' : ''}>
                                    Edições
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>

            <CardContent>
                {filteredUpdates.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">
                            {searchTerm || activeFilter !== 'all'
                                ? 'Nenhum registro encontrado com os filtros aplicados'
                                : 'Nenhum registro recente.'
                            }
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-muted-foreground mb-3">
                            {filteredUpdates.length} {filteredUpdates.length === 1 ? 'registro' : 'registros'}
                        </p>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                            {filteredUpdates.map(update => (
                                <div key={update.id} className="flex items-start gap-3">
                                    <div className="bg-muted p-2 rounded-full flex-shrink-0">
                                        {getIcon(update.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm">
                                            <span className="font-semibold text-primary">{update.patient_name}</span>
                                            {' '}
                                            <span className="text-foreground">{update.description}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {update.detail && `${update.detail} • `}
                                            {formatDistanceToNow(new Date(update.timestamp), {
                                                addSuffix: true,
                                                locale: ptBR
                                            })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default PatientUpdatesWidget;
