import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Utensils, Calendar, Clock, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const typeConfig = {
    clinical: {
        color: 'blue',
        icon: FileText,
        bgClass: 'bg-blue-50',
        textClass: 'text-blue-600',
        borderClass: 'border-blue-200'
    },
    operational: {
        color: 'emerald',
        icon: Utensils,
        bgClass: 'bg-emerald-50',
        textClass: 'text-emerald-600',
        borderClass: 'border-emerald-200'
    },
    default: {
        color: 'slate',
        icon: Calendar,
        bgClass: 'bg-slate-50',
        textClass: 'text-slate-600',
        borderClass: 'border-slate-200'
    }
};

export default function TimelineItem({ item, patientSlug, handleCopyLink, copiedToken }) {
    const navigate = useNavigate();
    const config = typeConfig[item.type] || typeConfig.default;
    const Icon = config.icon;

    const handleNavigate = () => {
        if (item.subType === 'anamnesis') {
            navigate(`/nutritionist/patients/${patientSlug}/anamnesis/${item.originalId}/edit`);
        } else if (item.subType === 'meal_plan') {
            navigate(`/nutritionist/patients/${patientSlug}/meal-plans/${item.originalId}`);
        }
    };

    return (
        <div className="relative pl-8 pb-8 group">
            {/* Linha vertical (conector) */}
            <div className="absolute top-0 bottom-0 left-[15px] w-px bg-slate-200 group-last:bg-transparent" />
            
            {/* Círculo com Ícone */}
            <div className={cn(
                "absolute top-0 left-0 w-8 h-8 rounded-full flex items-center justify-center border-2 ring-4 ring-white z-10",
                config.bgClass,
                config.borderClass
            )}>
                <Icon className={cn("w-4 h-4", config.textClass)} />
            </div>

            {/* Conteúdo do Card */}
            <Card 
                onClick={handleNavigate}
                className={cn(
                    "ml-4 cursor-pointer transition-all duration-200 border-l-4 hover:shadow-md",
                    item.type === 'clinical' ? 'border-l-blue-500 hover:border-l-blue-600' : 'border-l-emerald-500 hover:border-l-emerald-600'
                )}
            >
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-slate-800 text-base">{item.title}</h4>
                                {item.isLegacy && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 px-1.5 py-0">
                                        Legado
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center text-xs text-slate-500 gap-3">
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {format(new Date(item.date), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {format(new Date(item.date), "HH:mm")}
                                </span>
                            </div>
                        </div>
                        
                        <Badge variant="secondary" className={cn(
                            "w-fit",
                            item.status === 'completed' || item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                        )}>
                            {item.status === 'draft' ? 'Rascunho' : 
                             item.status === 'completed' ? 'Finalizado' : 
                             item.status === 'active' ? 'Ativo' : 
                             item.status === 'archived' ? 'Arquivado' : item.status}
                        </Badge>
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-2 mt-2">
                        {item.description || 'Nenhuma descrição adicional.'}
                    </p>

                    {item.subType === 'anamnesis' && item.status === 'draft' && item.raw?.public_access_token && (
                        <div className="mt-4">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={(e) => handleCopyLink(e, item.raw.public_access_token)}
                            >
                                {copiedToken === item.raw.public_access_token ? (
                                    <span className="flex items-center"><span className="w-3 h-3 mr-1 inline-block bg-green-500 rounded-full" /> Link Copiado!</span>
                                ) : (
                                    <span className="flex items-center"><span className="w-3 h-3 mr-1 inline-block bg-blue-500 rounded-full" /> Copiar Link para Paciente</span>
                                )}
                            </Button>
                        </div>
                    )}

                    <div className="mt-4 flex justify-end">
                        <div className="text-xs font-medium flex items-center text-slate-500 group-hover:text-blue-600 transition-colors">
                            Ver detalhes <ChevronRight className="w-3 h-3 ml-1" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
