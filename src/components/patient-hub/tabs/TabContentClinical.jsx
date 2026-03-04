import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Droplet, CheckCircle2, AlertCircle, Calendar, ArrowRight, Loader2, MessageSquare, Send, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';
import { getRecentLabResults } from '@/lib/supabase/lab-results-queries';
import {
    getMessageTemplates,
    dispatchMessageTemplate,
    previewTemplate,
    TEMPLATE_CONTEXTS
} from '@/lib/supabase/message-templates-queries';

const TabContentClinical = ({ patientId, patientData, modulesStatus = {} }) => {
    const patient = patientData || { id: patientId };
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();
    const [latestAnamnesis, setLatestAnamnesis] = useState(null);
    const [anamnesisLoading, setAnamnesisLoading] = useState(true);
    const [labResults, setLabResults] = useState([]);
    const [labsLoading, setLabsLoading] = useState(true);

    // Comunicação contextual
    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [dispatching, setDispatching] = useState(false);
    const [previewData, setPreviewData] = useState(null);

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

    // Fetch templates for contextual dispatch
    useEffect(() => {
        const fetchTemplates = async () => {
            if (!user?.id) return;
            setTemplatesLoading(true);
            try {
                const { data } = await getMessageTemplates({
                    nutritionistId: user.id,
                    isActive: true,
                    limit: 50
                });
                setTemplates(data || []);
            } finally {
                setTemplatesLoading(false);
            }
        };
        fetchTemplates();
    }, [user?.id]);

    const handleTemplateSelect = (id) => {
        setSelectedTemplateId(id);
        const tpl = templates.find(t => String(t.id) === id);
        if (tpl) {
            setPreviewData(previewTemplate({
                titleTemplate: tpl.title_template || '',
                bodyTemplate: tpl.body_template
            }));
        } else {
            setPreviewData(null);
        }
    };

    const handleDispatch = async () => {
        if (!selectedTemplateId || !patientId || !user?.id) return;
        setDispatching(true);
        try {
            const { data, error } = await dispatchMessageTemplate({
                templateId: Number(selectedTemplateId),
                patientId,
                triggerEvent: 'manual_clinical_tab'
            });
            if (error) throw error;
            if (data?.ok === false) throw new Error(data.reason || 'Erro no disparo');

            toast({ title: 'Mensagem enviada ao paciente', variant: 'success' });
            setSelectedTemplateId('');
            setPreviewData(null);
        } catch (err) {
            toast({ title: 'Erro ao enviar mensagem', description: err.message, variant: 'destructive' });
        } finally {
            setDispatching(false);
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
                    onClick={() => navigate(patientRoute(patient, 'anamnese'))}
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
                onClick={() => navigate(patientRoute(patient, 'anamnese'))}
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
                            onClick={() => navigate(patientRoute(patient, 'anamnesis'))}
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
                    onClick={() => navigate(patientRoute(patient, 'lab-results'))}
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
                onClick={() => navigate(patientRoute(patient, 'lab-results'))}
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
                            onClick={() => navigate(patientRoute(patient, 'lab-results'))}
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

            {/* Comunicação Contextual */}
            <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-blue-500" />
                                Comunicação Contextual
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                                Envie mensagens personalizadas com templates clínicos.
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 gap-1 text-xs text-blue-500"
                            onClick={() => navigate('/nutritionist/message-templates')}
                        >
                            <ExternalLink className="w-3 h-3" />
                            Gerenciar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {templatesLoading ? (
                        <p className="text-sm text-muted-foreground py-2">Carregando templates...</p>
                    ) : templates.length === 0 ? (
                        <div className="text-center py-4">
                            <p className="text-sm text-muted-foreground mb-2">
                                Nenhum template ativo encontrado.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate('/nutritionist/message-templates')}
                                className="gap-1"
                            >
                                <MessageSquare className="w-4 h-4" />
                                Criar primeiro template
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um template..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEMPLATE_CONTEXTS.map(ctx => {
                                        const group = templates.filter(t => t.context === ctx.value);
                                        if (group.length === 0) return null;
                                        return (
                                            <React.Fragment key={ctx.value}>
                                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                    {ctx.label}
                                                </div>
                                                {group.map(tpl => (
                                                    <SelectItem key={tpl.id} value={String(tpl.id)}>
                                                        {tpl.name}
                                                    </SelectItem>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </SelectContent>
                            </Select>

                            {previewData && (
                                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Pré-visualização
                                    </p>
                                    {previewData.title && (
                                        <p className="text-sm font-semibold">{previewData.title}</p>
                                    )}
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                                        {previewData.body}
                                    </p>
                                </div>
                            )}

                            <Button
                                className="w-full gap-2"
                                disabled={!selectedTemplateId || dispatching}
                                onClick={handleDispatch}
                            >
                                {dispatching
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Send className="w-4 h-4" />}
                                Enviar mensagem ao paciente
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default TabContentClinical;
