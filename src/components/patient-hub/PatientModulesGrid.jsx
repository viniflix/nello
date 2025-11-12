import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    BarChart3,
    Utensils,
    BookOpen,
    Droplet,
    Target,
    Trophy
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ModuleCard = ({ title, description, icon: Icon, to, status, onClick }) => {
    const navigate = useNavigate();

    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return { label: 'Preenchido', variant: 'success', className: 'bg-green-100 text-green-800 border-green-200' };
            case 'pending':
                return { label: 'Pendente', variant: 'warning', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
            case 'not_started':
                return { label: 'Não iniciado', variant: 'secondary', className: 'bg-gray-100 text-gray-800 border-gray-200' };
            default:
                return { label: 'Não iniciado', variant: 'secondary', className: 'bg-gray-100 text-gray-800 border-gray-200' };
        }
    };

    const statusBadge = getStatusBadge(status);

    const handleClick = () => {
        if (onClick) {
            onClick();
        } else if (to && to !== '#') {
            navigate(to);
        }
    };

    return (
        <Card
            className={`bg-card hover:shadow-lg hover:border-primary transition-all cursor-pointer group ${
                to === '#' ? 'opacity-75 cursor-not-allowed' : ''
            }`}
            onClick={handleClick}
        >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 p-3">
                <div className="flex items-start gap-2 flex-1">
                    <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                        <CardTitle className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                            {title}
                        </CardTitle>
                    </div>
                </div>
                <Badge
                    variant={statusBadge.variant}
                    className={`text-[10px] ${statusBadge.className} shrink-0`}
                >
                    {statusBadge.label}
                </Badge>
            </CardHeader>
            <CardContent className="pt-0 pb-3 px-3">
                <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
            </CardContent>
        </Card>
    );
};

const PatientModulesGrid = ({ patientId, modulesStatus = {} }) => {
    const modules = [
        {
            id: 'anamnese',
            title: 'Anamnese',
            description: 'Histórico clínico e hábitos de vida do paciente.',
            icon: FileText,
            to: `/nutritionist/patients/${patientId}/anamnese`,
            status: modulesStatus.anamnese || 'not_started'
        },
        {
            id: 'anthropometry',
            title: 'Avaliação Antropométrica',
            description: 'Medidas de peso, altura, circunferências e dobras cutâneas.',
            icon: BarChart3,
            to: `/nutritionist/patients/${patientId}/anthropometry`,
            status: modulesStatus.anthropometry || 'not_started'
        },
        {
            id: 'meal_plan',
            title: 'Plano Alimentar',
            description: 'Prescrição de dieta e orientações nutricionais.',
            icon: Utensils,
            to: `/nutritionist/patients/${patientId}/meal-plan`,
            status: modulesStatus.meal_plan || 'not_started'
        },
        {
            id: 'food_diary',
            title: 'Histórico Alimentar',
            description: 'Registro de refeições e diário alimentar do paciente.',
            icon: BookOpen,
            to: `/nutritionist/patients/${patientId}/food-diary`,
            status: modulesStatus.food_diary || 'not_started'
        },
        {
            id: 'lab_results',
            title: 'Exames Laboratoriais',
            description: 'Resultados de exames de sangue e análises clínicas.',
            icon: Droplet,
            to: `/nutritionist/patients/${patientId}/lab-results`,
            status: modulesStatus.lab_results || 'not_started'
        },
        {
            id: 'prescriptions',
            title: 'Metas e Prescrições',
            description: 'Calorias, macros, suplementos e orientações gerais.',
            icon: Target,
            to: `/nutritionist/patients/${patientId}/prescriptions`,
            status: modulesStatus.prescriptions || 'not_started'
        },
        {
            id: 'achievements',
            title: 'Conquistas',
            description: 'Gerenciar e visualizar conquistas do paciente.',
            icon: Trophy,
            to: `/nutritionist/patients/${patientId}/achievements`,
            status: modulesStatus.achievements || 'not_started'
        }
    ];

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">Módulos de Atendimento</h2>
                <p className="text-sm text-muted-foreground">
                    Acesse e gerencie todas as informações do paciente organizadas por módulo.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {modules.map((module) => (
                    <ModuleCard
                        key={module.id}
                        title={module.title}
                        description={module.description}
                        icon={module.icon}
                        to={module.to}
                        status={module.status}
                    />
                ))}
            </div>
        </div>
    );
};

export default PatientModulesGrid;
