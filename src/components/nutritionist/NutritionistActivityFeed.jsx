import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getPatientsWithLowAdherence, getPatientsPendingData } from '@/lib/supabase/patient-queries';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    FileText,
    Weight,
    BookOpen,
    Calculator,
    Clock,
    Loader2,
    ChevronRight,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

/**
 * Card de categoria expansível
 */
const CategoryCard = ({ title, icon: Icon, items, color, onItemClick, defaultExpanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    if (items.length === 0) return null;

    return (
        <div className={`rounded-lg border-2 border-${color}/20 bg-${color}/5 overflow-hidden`}>
            {/* Header - Clicável para expandir/recolher */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-full flex items-center justify-between p-4 hover:bg-${color}/10 transition-colors`}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full bg-${color}/20`}>
                        <Icon className={`h-5 w-5 text-${color}`} />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground">
                            {items.length} {items.length === 1 ? 'paciente' : 'pacientes'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`border-${color} text-${color}`}>
                        {items.length}
                    </Badge>
                    {isExpanded ? (
                        <ChevronUp className={`h-5 w-5 text-${color}`} />
                    ) : (
                        <ChevronDown className={`h-5 w-5 text-${color}`} />
                    )}
                </div>
            </button>

            {/* Conteúdo - Expansível com scroll nativo */}
            {isExpanded && (
                <div className="border-t-2 border-border">
                    <div className="max-h-[300px] overflow-y-auto">
                        {items.map((item, index) => (
                            <div
                                key={index}
                                onClick={() => onItemClick(item)}
                                className={`flex items-center justify-between p-4 hover:bg-${color}/10 transition-colors cursor-pointer border-b border-border last:border-b-0 group`}
                            >
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-foreground">
                                        {item.patient_name || item.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {item.detail || item.description}
                                    </p>
                                </div>
                                <ChevronRight className={`h-4 w-4 text-muted-foreground group-hover:text-${color} transition-colors flex-shrink-0 ml-2`} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Feed do NUTRICIONISTA com categorias expansíveis
 */
const NutritionistActivityFeed = () => {
    const [lowAdherencePatients, setLowAdherencePatients] = useState([]);
    const [pendingPatients, setPendingPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchAlerts = async () => {
            if (!user?.id) return;

            setLoading(true);

            try {
                const [lowAdherenceResult, pendingResult] = await Promise.all([
                    getPatientsWithLowAdherence(user.id),
                    getPatientsPendingData(user.id)
                ]);

                setLowAdherencePatients(lowAdherenceResult.data || []);
                setPendingPatients(pendingResult.data || []);
            } catch (error) {
                console.error('Erro ao buscar alertas:', error);
            }

            setLoading(false);
        };

        fetchAlerts();
    }, [user]);

    if (loading) {
        return (
            <Card className="bg-card shadow-card-dark rounded-xl">
                <CardHeader>
                    <CardTitle className="font-clash text-lg font-semibold text-primary">
                        Feed de Atividades
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">Carregando...</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    // Agrupar pendências por tipo
    const categories = {
        low_adherence: {
            title: 'Baixa Adesão',
            icon: Clock,
            color: 'secondary',
            items: lowAdherencePatients.map(p => ({
                ...p,
                patient_name: p.name,
                detail: p.days_inactive === null
                    ? 'Sem registros de refeição'
                    : `Sem registros há ${p.days_inactive} dia${p.days_inactive !== 1 ? 's' : ''}`,
                route: `/nutritionist/patients/${p.id}`
            }))
        },
        anamnesis: {
            title: 'Anamnese Pendente',
            icon: FileText,
            color: 'primary',
            items: []
        },
        anthropometry: {
            title: 'Avaliação Pendente',
            icon: Weight,
            color: 'primary',
            items: []
        },
        meal_plan: {
            title: 'Plano Alimentar Pendente',
            icon: BookOpen,
            color: 'primary',
            items: []
        },
        prescription: {
            title: 'Cálculo Pendente',
            icon: Calculator,
            color: 'primary',
            items: []
        }
    };

    // Distribuir pendências nas categorias
    pendingPatients.forEach(patient => {
        patient.pending_items.forEach(item => {
            if (categories[item.type]) {
                categories[item.type].items.push({
                    patient_name: patient.patient_name,
                    detail: item.label,
                    route: item.route
                });
            }
        });
    });

    const totalAlerts = Object.values(categories).reduce((sum, cat) => sum + cat.items.length, 0);

    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader>
                <CardTitle className="font-clash text-lg font-semibold text-primary">
                    Feed de Atividades
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                    Alertas e pendências dos seus pacientes
                </CardDescription>
            </CardHeader>
            <CardContent>
                {totalAlerts === 0 ? (
                    <div className="text-center py-12">
                        <AlertTriangle className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium mb-1">
                            Tudo em dia!
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Não há alertas ou pendências no momento
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Baixa Adesão */}
                        <CategoryCard
                            title={categories.low_adherence.title}
                            icon={categories.low_adherence.icon}
                            items={categories.low_adherence.items}
                            color={categories.low_adherence.color}
                            onItemClick={(item) => navigate(item.route)}
                        />

                        {/* Anamnese Pendente */}
                        <CategoryCard
                            title={categories.anamnesis.title}
                            icon={categories.anamnesis.icon}
                            items={categories.anamnesis.items}
                            color={categories.anamnesis.color}
                            onItemClick={(item) => navigate(item.route)}
                        />

                        {/* Avaliação Pendente */}
                        <CategoryCard
                            title={categories.anthropometry.title}
                            icon={categories.anthropometry.icon}
                            items={categories.anthropometry.items}
                            color={categories.anthropometry.color}
                            onItemClick={(item) => navigate(item.route)}
                        />

                        {/* Plano Alimentar Pendente */}
                        <CategoryCard
                            title={categories.meal_plan.title}
                            icon={categories.meal_plan.icon}
                            items={categories.meal_plan.items}
                            color={categories.meal_plan.color}
                            onItemClick={(item) => navigate(item.route)}
                        />

                        {/* Cálculo Pendente */}
                        <CategoryCard
                            title={categories.prescription.title}
                            icon={categories.prescription.icon}
                            items={categories.prescription.items}
                            color={categories.prescription.color}
                            onItemClick={(item) => navigate(item.route)}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default NutritionistActivityFeed;
