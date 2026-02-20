import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Droplet, CheckCircle2, AlertCircle, Calendar, ArrowRight, Loader2, Brain, Sparkles, Check, X, FlaskConical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';
import { getRecentLabResults } from '@/lib/supabase/lab-results-queries';
import {
    getClinicalRecommendations,
    createClinicalRecommendation,
    acceptClinicalRecommendation,
    dismissClinicalRecommendation,
    markClinicalRecommendationApplied
} from '@/lib/supabase/clinical-recommendations-queries';

const TabContentClinical = ({ patientId, modulesStatus = {} }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();
    const [latestAnamnesis, setLatestAnamnesis] = useState(null);
    const [anamnesisLoading, setAnamnesisLoading] = useState(true);
    const [labResults, setLabResults] = useState([]);
    const [labsLoading, setLabsLoading] = useState(true);
    const [recommendations, setRecommendations] = useState([]);
    const [recommendationsLoading, setRecommendationsLoading] = useState(true);
    const [recommendationActionLoading, setRecommendationActionLoading] = useState(null);

    useEffect(() => {
        const fetchLatestAnamnesis = async () => {
            if (!patientId) return;

            setAnamnesisLoading(true);
            try {
                const { data } = await getLatestAnamnesis(patientId);
                setLatestAnamnesis(data);
            } catch (error) {
                console.error('Erro ao buscar anamnese:', error);
            } finally {
                setAnamnesisLoading(false);
            }
        };

        const fetchLabResults = async () => {
            if (!patientId) return;

            setLabsLoading(true);
            try {
                const { data } = await getRecentLabResults(patientId);
                setLabResults(data || []);
            } catch (error) {
                console.error('Erro ao buscar exames:', error);
                setLabResults([]);
            } finally {
                setLabsLoading(false);
            }
        };

        fetchLatestAnamnesis();
        fetchLabResults();
    }, [patientId]);

    useEffect(() => {
        const fetchRecommendations = async () => {
            if (!patientId || !user?.id) return;
            setRecommendationsLoading(true);
            try {
                const { data, error } = await getClinicalRecommendations({
                    nutritionistId: user.id,
                    patientId,
                    limit: 10
                });
                if (error) throw error;
                setRecommendations(data || []);
            } catch (error) {
                console.error('Erro ao buscar recomendações clínicas:', error);
                setRecommendations([]);
            } finally {
                setRecommendationsLoading(false);
            }
        };

        fetchRecommendations();
    }, [patientId, user?.id]);

    const recommendationStatusMeta = (status) => {
        const map = {
            pending: { label: 'Pendente', className: 'bg-amber-100 text-amber-800 border-amber-300' },
            accepted: { label: 'Aceita', className: 'bg-sky-100 text-sky-800 border-sky-300' },
            dismissed: { label: 'Descartada', className: 'bg-gray-100 text-gray-800 border-gray-300' },
            applied: { label: 'Aplicada', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
        };
        return map[status] || map.pending;
    };

    const buildRecommendationDraft = () => {
        const highLabs = (labResults || []).filter((lab) => lab.status === 'high');
        const lowLabs = (labResults || []).filter((lab) => lab.status === 'low');

        if (highLabs.length > 0) {
            const sample = highLabs.slice(0, 2).map((lab) => lab.test_name).filter(Boolean).join(', ');
            return {
                recommendationKey: 'lab_risk_followup',
                title: 'Priorizar follow-up de risco laboratorial',
                recommendationText: 'Agendar retorno curto e revisar plano alimentar com foco em normalização dos marcadores alterados.',
                rationale: `Foram identificados exames acima da referência${sample ? ` (${sample})` : ''}. A intervenção precoce reduz risco de piora clínica.`,
                confidenceScore: 0.9,
                inputSnapshot: {
                    high_count: highLabs.length,
                    low_count: lowLabs.length,
                    latest_labs: highLabs.slice(0, 3).map((lab) => ({
                        id: lab.id,
                        test_name: lab.test_name,
                        status: lab.status,
                        test_date: lab.test_date
                    })),
                    modules_status: modulesStatus || {}
                },
                outputSnapshot: {
                    action_type: 'followup_priority',
                    suggested_route: `/nutritionist/patients/${patientId}/lab-results`
                }
            };
        }

        if (!latestAnamnesis) {
            return {
                recommendationKey: 'anamnesis_missing',
                title: 'Completar anamnese para base clínica',
                recommendationText: 'Registrar anamnese completa antes de ajustes avançados para maior segurança na conduta.',
                rationale: 'Sem anamnese consolidada, aumenta o risco de decisões sem contexto clínico suficiente.',
                confidenceScore: 0.96,
                inputSnapshot: {
                    has_anamnesis: false,
                    modules_status: modulesStatus || {}
                },
                outputSnapshot: {
                    action_type: 'collect_context',
                    suggested_route: `/nutritionist/patients/${patientId}/anamnese`
                }
            };
        }

        if (modulesStatus?.meal_plan !== 'completed') {
            return {
                recommendationKey: 'meal_plan_completion',
                title: 'Concluir plano alimentar com metas atuais',
                recommendationText: 'Finalizar um plano alimentar ativo com distribuição de macros alinhada ao cenário clínico atual.',
                rationale: 'A ausência de plano completo reduz aderência e dificulta acompanhamento de evolução nutricional.',
                confidenceScore: 0.82,
                inputSnapshot: {
                    meal_plan_status: modulesStatus?.meal_plan || 'not_started',
                    modules_status: modulesStatus || {}
                },
                outputSnapshot: {
                    action_type: 'complete_meal_plan',
                    suggested_route: `/nutritionist/patients/${patientId}/meal-plan`
                }
            };
        }

        return {
            recommendationKey: 'routine_monitoring',
            title: 'Manter monitoramento clínico e adesão',
            recommendationText: 'Manter plano atual e reavaliar indicadores em janela de acompanhamento curto.',
            rationale: 'Sem alertas críticos imediatos, o foco é consistência de adesão e monitoramento periódico.',
            confidenceScore: 0.68,
            inputSnapshot: {
                has_anamnesis: Boolean(latestAnamnesis),
                labs_count: labResults.length,
                modules_status: modulesStatus || {}
            },
            outputSnapshot: {
                action_type: 'monitoring',
                suggested_route: `/nutritionist/patients/${patientId}/hub`
            }
        };
    };

    const reloadRecommendations = async () => {
        if (!patientId || !user?.id) return;
        const { data, error } = await getClinicalRecommendations({
            nutritionistId: user.id,
            patientId,
            limit: 10
        });
        if (!error) {
            setRecommendations(data || []);
        }
    };

    const handleGenerateRecommendation = async () => {
        if (!user?.id || !patientId) return;
        setRecommendationActionLoading('generate');
        try {
            const draft = buildRecommendationDraft();
            const { error } = await createClinicalRecommendation({
                nutritionistId: user.id,
                patientId,
                recommendationKey: draft.recommendationKey,
                title: draft.title,
                recommendationText: draft.recommendationText,
                rationale: draft.rationale,
                confidenceScore: draft.confidenceScore,
                inputSnapshot: draft.inputSnapshot,
                outputSnapshot: draft.outputSnapshot,
                metadata: { source: 'copilot_v1_rule_based' }
            });
            if (error) throw error;

            await reloadRecommendations();
            toast({
                title: 'Recomendação criada',
                description: 'O copiloto gerou uma recomendação explicável para avaliação manual.',
                variant: 'success'
            });
        } catch (error) {
            console.error('Erro ao gerar recomendação clínica:', error);
            toast({
                title: 'Erro ao gerar recomendação',
                description: 'Não foi possível gerar a recomendação agora.',
                variant: 'destructive'
            });
        } finally {
            setRecommendationActionLoading(null);
        }
    };

    const handleRecommendationStatus = async (recommendation, action) => {
        if (!recommendation?.id || !user?.id) return;
        setRecommendationActionLoading(`${action}-${recommendation.id}`);
        try {
            let result = null;
            if (action === 'accept') {
                result = await acceptClinicalRecommendation({
                    recommendationId: recommendation.id,
                    actorUserId: user.id
                });
            } else if (action === 'dismiss') {
                result = await dismissClinicalRecommendation({
                    recommendationId: recommendation.id,
                    actorUserId: user.id
                });
            } else if (action === 'apply') {
                result = await markClinicalRecommendationApplied({
                    recommendationId: recommendation.id,
                    actorUserId: user.id
                });
            }

            if (result?.error) throw result.error;
            await reloadRecommendations();
        } catch (error) {
            console.error('Erro ao atualizar recomendação clínica:', error);
            toast({
                title: 'Erro de atualização',
                description: 'Não foi possível atualizar o status da recomendação.',
                variant: 'destructive'
            });
        } finally {
            setRecommendationActionLoading(null);
        }
    };

    const AnamnesisCard = () => {
        const hasAnamnesis = !anamnesisLoading && latestAnamnesis;

        if (anamnesisLoading) {
            return (
                <Card className="border-l-4 border-l-[#a9b388] h-full">
                    <CardContent className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">Carregando anamnese...</p>
                    </CardContent>
                </Card>
            );
        }

        if (!hasAnamnesis) {
            return (
                <Card
                    className="border-l-4 border-l-[#c4661f] bg-[#fefae0]/30 hover:shadow-md transition-all cursor-pointer h-full"
                    onClick={() => navigate(`/nutritionist/patients/${patientId}/anamnese`)}
                >
                    <CardContent className="py-8">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center flex-shrink-0">
                                <AlertCircle className="w-6 h-6 text-[#c4661f]" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <h3 className="text-lg font-semibold text-foreground">Anamnese</h3>
                                    <Badge className="bg-[#fefae0] text-[#c4661f] border-[#c4661f]">
                                        Pendente
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Histórico clínico ainda não registrado. Complete a anamnese para identificar
                                    alergias, condições de saúde e medicações em uso.
                                </p>
                                <span className="inline-flex items-center gap-2 text-sm font-medium text-[#c4661f]">
                                    <FileText className="w-4 h-4" />
                                    Iniciar Anamnese
                                    <ArrowRight className="w-4 h-4" />
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            );
        }

        const statusConfig = {
            draft: { label: 'Rascunho', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
            completed: { label: 'Completa', color: 'bg-[#a9b388]/20 text-[#5f6f52] border-[#5f6f52]' }
        };
        const config = statusConfig[latestAnamnesis.status] || statusConfig.draft;

        return (
            <Card
                className="border-l-4 border-l-[#5f6f52] hover:shadow-xl transition-all cursor-pointer h-full"
                onClick={() => navigate(`/nutritionist/patients/${patientId}/anamnese`)}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-[#5f6f52]" />
                        <CardTitle className="text-lg">Anamnese</CardTitle>
                        <Badge variant="outline" className={config.color}>
                            {config.label}
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="bg-[#fefae0] border border-[#a9b388] rounded-lg p-3 mb-3">
                        <div className="text-xs font-semibold text-[#5f6f52] mb-1 uppercase tracking-wide">
                            📋 Documento
                        </div>
                        <p className="text-sm text-foreground">
                            {latestAnamnesis.template?.title || 'Anamnese Nutricional'}
                        </p>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 mt-3 border-t">
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Registrada em: {new Date(latestAnamnesis.date).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric'
                            })}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[#5f6f52] hover:bg-[#5f6f52]/10"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/anamnesis`)}
                        >
                            Abrir <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const LabsCard = () => {
        if (labsLoading) {
            return (
                <Card className="border-l-4 border-l-[#b99470] h-full">
                    <CardContent className="py-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Carregando exames...</p>
                    </CardContent>
                </Card>
            );
        }

        const hasLabResults = labResults && labResults.length > 0;

        if (!hasLabResults) {
            return (
                <Card
                    className="border-dashed border-2 border-[#a9b388] bg-[#fefae0]/30 hover:shadow-md transition-all cursor-pointer h-full"
                    onClick={() => navigate(`/nutritionist/patients/${patientId}/lab-results`)}
                >
                    <CardContent className="py-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-[#fefae0] flex items-center justify-center mx-auto mb-3">
                            <Droplet className="w-6 h-6 text-[#b99470]" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground mb-2">
                            Exames Laboratoriais
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                            Nenhum exame registrado. Adicione resultados de análises clínicas
                            para um acompanhamento mais completo.
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#b99470]">
                            <Droplet className="w-4 h-4" />
                            Adicionar Exames
                            <ArrowRight className="w-4 h-4" />
                        </span>
                    </CardContent>
                </Card>
            );
        }

        // Mostrar apenas os 3 mais recentes
        const recentTests = labResults.slice(0, 3);
        const mostRecentDate = labResults[0]?.test_date;

        return (
            <Card
                className="border-l-4 border-l-[#b99470] hover:shadow-xl transition-all cursor-pointer h-full"
                onClick={() => navigate(`/nutritionist/patients/${patientId}/lab-results`)}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Droplet className="w-5 h-5 text-[#b99470]" />
                        <CardTitle className="text-base">Exames Laboratoriais</CardTitle>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="space-y-2 mb-3">
                        {recentTests.map((test) => (
                            <div
                                key={test.id}
                                className={cn(
                                    "flex items-center justify-between p-3 rounded-lg border",
                                    test.status === 'normal' ? "bg-emerald-50 border-emerald-200" :
                                    test.status === 'low' ? "bg-amber-50 border-amber-200" :
                                    test.status === 'high' ? "bg-red-50 border-red-200" :
                                    "bg-gray-50 border-gray-200"
                                )}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-foreground truncate">{test.test_name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {test.test_value} {test.test_unit || ''}
                                    </div>
                                </div>
                                <Badge variant="outline" className={cn(
                                    "text-xs ml-2",
                                    test.status === 'normal' ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                                    test.status === 'low' ? "bg-amber-100 text-amber-800 border-amber-300" :
                                    test.status === 'high' ? "bg-red-100 text-red-800 border-red-300" :
                                    "bg-gray-100 text-gray-800 border-gray-300"
                                )}>
                                    {test.status === 'normal' ? 'Normal' :
                                     test.status === 'low' ? 'Baixo' :
                                     test.status === 'high' ? 'Alto' : 'Pendente'}
                                </Badge>
                            </div>
                        ))}
                    </div>

                    <div className="text-xs text-muted-foreground pt-3 border-t flex items-center justify-between">
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {mostRecentDate && `Últimos exames: ${new Date(mostRecentDate).toLocaleDateString('pt-BR')}`}
                            {!mostRecentDate && 'Nenhum exame recente'}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[#b99470] hover:bg-[#b99470]/10"
                            onClick={() => navigate(`/nutritionist/patients/${patientId}/lab-results`)}
                        >
                            Abrir <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Dados Clínicos</h3>
                <p className="text-sm text-muted-foreground">
                    Histórico de saúde e exames laboratoriais
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnamnesisCard />
                <LabsCard />
            </div>

            <Card className="border-l-4 border-l-[#5f6f52]">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Brain className="w-5 h-5 text-[#5f6f52]" />
                                Copiloto Clínico v1
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Recomendações explicáveis com aceite manual obrigatório.
                            </p>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleGenerateRecommendation}
                            disabled={recommendationActionLoading === 'generate'}
                            className="shrink-0"
                        >
                            {recommendationActionLoading === 'generate' ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Sparkles className="w-4 h-4 mr-2" />
                            )}
                            Gerar recomendação
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {recommendationsLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            Carregando recomendações...
                        </div>
                    ) : recommendations.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            Nenhuma recomendação registrada ainda para este paciente.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recommendations.map((recommendation) => {
                                const statusMeta = recommendationStatusMeta(recommendation.status);
                                const actionKey = recommendationActionLoading;
                                const isAcceptLoading = actionKey === `accept-${recommendation.id}`;
                                const isDismissLoading = actionKey === `dismiss-${recommendation.id}`;
                                const isApplyLoading = actionKey === `apply-${recommendation.id}`;
                                return (
                                    <div key={recommendation.id} className="rounded-lg border p-3">
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <p className="text-sm font-semibold text-foreground">{recommendation.title}</p>
                                            <Badge variant="outline" className={statusMeta.className}>
                                                {statusMeta.label}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-foreground">{recommendation.recommendation_text}</p>
                                        <p className="text-xs text-muted-foreground mt-2">
                                            Justificativa: {recommendation.rationale}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                            <FlaskConical className="w-3 h-3" />
                                            Confiança: {Math.round((Number(recommendation.confidence_score || 0) * 100))}%
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={recommendation.status !== 'pending' || isAcceptLoading}
                                                onClick={() => handleRecommendationStatus(recommendation, 'accept')}
                                            >
                                                {isAcceptLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                                                Aceitar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={recommendation.status !== 'pending' || isDismissLoading}
                                                onClick={() => handleRecommendationStatus(recommendation, 'dismiss')}
                                            >
                                                {isDismissLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
                                                Descartar
                                            </Button>
                                            <Button
                                                size="sm"
                                                disabled={recommendation.status !== 'accepted' || isApplyLoading}
                                                onClick={() => handleRecommendationStatus(recommendation, 'apply')}
                                            >
                                                {isApplyLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                                Marcar aplicada
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default TabContentClinical;
