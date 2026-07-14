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
import TimelineFeed from '@/features/clinical-records/components/TimelineFeed';

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
                        <h2 className="text-2xl font-bold text-slate-800">Prontuário & Histórico</h2>
                        <p className="text-sm text-slate-500">Linha do tempo de todas as interações e eventos clínicos do paciente.</p>
                    </div>
                </div>
                <Button onClick={() => setIsTemplateModalOpen(true)} className="gap-2 bg-[#5f6f52] hover:bg-[#4a5740]">
                    <Plus className="w-4 h-4" />
                    Nova Anamnese
                </Button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 md:p-6 mb-8">
                <TimelineFeed 
                    patientId={patientId} 
                    patientSlug={paramValue} 
                    handleCopyLink={handleCopyLink} 
                    copiedToken={copiedToken} 
                />
            </div>

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
