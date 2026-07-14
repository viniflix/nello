import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { useAnamnesisRunner } from '@/hooks/useAnamnesisRunner';
import { useAnamnesisTemplates } from '@/hooks/useAnamnesisTemplates';
import { useToast } from '@/components/ui/use-toast';
import { ClipboardList, Plus, Calendar, FileText, ChevronRight, ArrowLeft, Link2, Copy, Check } from 'lucide-react';
import { FormSkeleton, SimpleListSkeleton } from '@/components/ui/custom-skeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { patientAnamnesisEditRoute } from '@/lib/utils/patientRoutes';

export default function PatientAnamnesePage() {
    const navigate = useNavigate();
    const { patientId, paramValue } = useResolvedPatientId();
    const { usePatientRecords, createRecord } = useAnamnesisRunner(patientId);
    const { useTemplates } = useAnamnesisTemplates();

    const { data: records, isLoading: loadingRecords } = usePatientRecords();
    const { data: templates, isLoading: loadingTemplates } = useTemplates();

    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [copiedToken, setCopiedToken] = useState(null);
    const { toast } = useToast();

    const handleCopyLink = (e, token) => {
        e.stopPropagation();
        if (!token) {
            toast({ title: 'Erro', description: 'Token não encontrado', variant: 'destructive' });
            return;
        }
        const url = `${window.location.origin}/f/${token}`;
        navigator.clipboard.writeText(url);
        setCopiedToken(token);
        toast({ title: 'Link Copiado!', description: 'Envie este link para o paciente responder pelo celular.' });
        setTimeout(() => setCopiedToken(null), 3000);
    };

    const handleCreateNew = async (templateId) => {
        setIsTemplateModalOpen(false);
        const record = await createRecord.mutateAsync({ templateId });
        navigate(patientAnamnesisEditRoute({ slug: paramValue }, record.id));
    };

    if (loadingRecords) {
        return <div className="max-w-5xl mx-auto p-4 md:p-6"><SimpleListSkeleton /></div>;
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/nutritionist/patients/${paramValue}/hub`)}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar ao Hub
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Anamneses</h2>
                        <p className="text-sm text-slate-500">Histórico de formulários e questionários do paciente.</p>
                    </div>
                </div>
                <Button onClick={() => setIsTemplateModalOpen(true)} className="gap-2 bg-[#5f6f52] hover:bg-[#4a5740]">
                    <Plus className="w-4 h-4" />
                    Nova Anamnese
                </Button>
            </div>

            {records?.length === 0 ? (
                <Card className="border-dashed border-2 border-slate-300 bg-slate-50">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                            <ClipboardList className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-800 mb-2">Nenhuma Anamnese Registrada</h3>
                        <p className="text-sm text-slate-500 max-w-md mb-6">
                            Você ainda não aplicou nenhum questionário para este paciente. 
                            Inicie uma anamnese escolhendo um dos seus formulários.
                        </p>
                        <Button onClick={() => setIsTemplateModalOpen(true)} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Iniciar Primeira Anamnese
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {records?.map(record => (
                        <Card key={record.id} className="hover:shadow-md transition-all cursor-pointer border-l-4 hover:border-l-blue-500" onClick={() => navigate(patientAnamnesisEditRoute({ slug: paramValue }, record.id))}>
                            <CardContent className="p-5 flex items-start gap-4">
                                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-semibold text-slate-800">{record.template?.title || 'Formulário Sem Nome'}</h4>
                                        <Badge variant="outline" className={cn(
                                            record.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 
                                            record.status === 'validated' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                                        )}>
                                            {record.status === 'completed' ? 'Concluída' : record.status === 'validated' ? 'Validada' : 'Rascunho'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                        <Calendar className="w-3 h-3" />
                                        Criada em: {new Date(record.created_at).toLocaleDateString('pt-BR')}
                                    </div>
                                    {record.status === 'draft' && record.public_access_token && (
                                        <div className="mt-3">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-xs bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                                                onClick={(e) => handleCopyLink(e, record.public_access_token)}
                                            >
                                                {copiedToken === record.public_access_token ? <Check className="w-3 h-3 mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                                                Copiar Link para Paciente
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-400 self-center" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Escolha um Formulário</DialogTitle>
                        <DialogDescription>
                            Selecione qual formulário deseja preencher para este paciente.
                        </DialogDescription>
                    </DialogHeader>
                    {loadingTemplates ? (
                        <div className="py-8"><SimpleListSkeleton /></div>
                    ) : (
                        <div className="space-y-3 mt-4 max-h-[60vh] overflow-y-auto pr-2">
                            {templates?.map(t => (
                                <div key={t.id} onClick={() => handleCreateNew(t.id)} className="p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer transition-all flex items-center justify-between">
                                    <div>
                                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                                            {t.title}
                                            {t.is_system_default && <Badge variant="secondary" className="text-[10px]">Global</Badge>}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{t.description || "Sem descrição"}</p>
                                    </div>
                                    <Plus className="w-5 h-5 text-slate-400" />
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
