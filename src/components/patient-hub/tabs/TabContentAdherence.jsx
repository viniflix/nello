import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, BookHeart, Trophy, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * TabContentAdherence - Dashboard de Adesão ao Tratamento
 * Estilo: Dashboard moderno com paleta de cores do projeto
 */
const TabContentAdherence = ({ patientId, modulesStatus = {} }) => {
    const navigate = useNavigate();

    // TODO: Implementar queries reais quando módulos forem desenvolvidos
    // - Módulo de Metas/Prescrições
    // - Cálculo de adesão ao diário alimentar
    // - Sistema de conquistas/gamificação

    // ============================================================
    // CARD 1: METAS E PRESCRIÇÕES
    // ============================================================
    const GoalsCard = () => {
        return (
            <Card className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-md transition-all">
                <CardContent className="py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                        <Target className="w-6 h-6 text-[#5f6f52]" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">
                        Metas e Prescrições
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                        Módulo em desenvolvimento - Defina objetivos nutricionais e metas para acompanhar o progresso
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/prescriptions`)}
                        className="gap-2 border-[#5f6f52] text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <Target className="w-4 h-4" />
                        Criar Metas
                    </Button>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // CARD 2: ADESÃO AO DIÁRIO ALIMENTAR
    // ============================================================
    const AdherenceCard = () => {
        return (
            <Card className="border-dashed border-2 border-[#b99470] bg-[#fefae0]/30 hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <BookHeart className="w-5 h-5 text-[#b99470]" />
                        <CardTitle className="text-base">Adesão ao Diário</CardTitle>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="text-center py-6">
                        <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                            <BookHeart className="w-6 h-6 text-[#b99470]" />
                        </div>
                        <p className="text-sm font-medium text-foreground mb-2">
                            Módulo em Desenvolvimento
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                            O cálculo de adesão ao diário alimentar e métricas de engajamento serão implementados em breve
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/food-diary`)}
                            className="gap-2 border-[#b99470] text-[#b99470] hover:bg-[#b99470]/10"
                        >
                            Ver Diário Alimentar
                            <ArrowRight className="w-3 h-3" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // CARD 3: CONQUISTAS E GAMIFICAÇÃO
    // ============================================================
    const AchievementsCard = () => {
        return (
            <Card className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-md transition-all">
                <CardContent className="py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                        <Trophy className="w-6 h-6 text-[#5f6f52]" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">
                        Conquistas
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                        Sistema de gamificação em desenvolvimento - Badges e conquistas para motivar o paciente
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/achievements`)}
                        className="gap-2 border-[#5f6f52] text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <Trophy className="w-4 h-4" />
                        Ver Conquistas
                    </Button>
                </CardContent>
            </Card>
        );
    };

    // ============================================================
    // RENDER PRINCIPAL
    // ============================================================
    return (
        <div className="space-y-6">
            {/* Header da Seção */}
            <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Adesão ao Tratamento</h3>
                <p className="text-sm text-muted-foreground">
                    Metas, acompanhamento diário e sistema de conquistas
                </p>
            </div>

            {/* Grid de Cards */}
            <div className="space-y-4">
                {/* Metas - Full Width */}
                <GoalsCard />

                {/* Grid 2 Colunas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AdherenceCard />
                    <AchievementsCard />
                </div>
            </div>
        </div>
    );
};

export default TabContentAdherence;
