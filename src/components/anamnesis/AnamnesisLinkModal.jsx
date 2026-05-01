import React, { useState } from 'react';
import { ClipboardList, Link2, Loader2, Send, RefreshCw, Check, Clock, ExternalLink } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAnamnesisRunner } from '@/hooks/useAnamnesisRunner';
import { useAnamnesisTemplates } from '@/hooks/useAnamnesisTemplates';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Sprint F: Modal para enviar um link de anamnese para o paciente,
 * diretamente a partir da Agenda (card de consulta).
 *
 * Props:
 *   open, onOpenChange — controle de visibilidade
 *   patientId — UUID do paciente
 *   patientName — nome para exibição
 */
export function AnamnesisLinkModal({ open, onOpenChange, patientId, patientName }) {
    const { toast } = useToast();
    const { createRecord, generateLink, usePatientRecords } = useAnamnesisRunner(patientId);
    const { templates = [], isLoading: loadingTemplates } = useAnamnesisTemplates() || {};

    const [step, setStep] = useState('select'); // 'select' | 'link_ready'
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [expiresDays, setExpiresDays] = useState('7');
    const [generatedLink, setGeneratedLink] = useState('');
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const { data: patientRecords = [] } = usePatientRecords();
    // Verificar se já existe record pendente
    const pendingRecord = patientRecords.find(r => r.status === 'awaiting_patient');

    const handleGenerate = async () => {
        if (!selectedTemplateId) {
            toast({ title: 'Selecione um modelo', variant: 'destructive' });
            return;
        }
        setGenerating(true);
        try {
            // 1. Criar record
            const record = await createRecord.mutateAsync({
                templateId: selectedTemplateId,
                content: {},
            });

            // 2. Gerar link externo via RPC
            const linkData = await generateLink.mutateAsync({
                recordId: record.id,
                expiresDays: parseInt(expiresDays, 10) || 7,
            });

            const url = `${window.location.origin}/f/${linkData.token}`;
            setGeneratedLink(url);
            setStep('link_ready');
        } catch (err) {
            toast({ title: 'Erro ao gerar link', description: err.message, variant: 'destructive' });
        } finally {
            setGenerating(false);
        }
    };

    const handleResend = async () => {
        if (!pendingRecord) return;
        setGenerating(true);
        try {
            const linkData = await generateLink.mutateAsync({
                recordId: pendingRecord.id,
                expiresDays: parseInt(expiresDays, 10) || 7,
            });
            const url = `${window.location.origin}/f/${linkData.token}`;
            setGeneratedLink(url);
            setStep('link_ready');
        } catch (err) {
            toast({ title: 'Erro ao gerar link', description: err.message, variant: 'destructive' });
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(generatedLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
            toast({ title: 'Link copiado!', description: 'Cole e envie ao paciente.' });
        } catch {
            toast({ title: 'Erro ao copiar', variant: 'destructive' });
        }
    };

    const handleClose = () => {
        setStep('select');
        setSelectedTemplateId('');
        setGeneratedLink('');
        setCopied(false);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-blue-600" />
                        Enviar Anamnese para {patientName || 'Paciente'}
                    </DialogTitle>
                    <DialogDescription>
                        Gere um link seguro para o paciente preencher antes da consulta.
                    </DialogDescription>
                </DialogHeader>

                {step === 'select' ? (
                    <div className="space-y-5 py-2">
                        {/* Aviso se já há anamnese pendente */}
                        {pendingRecord && (
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-amber-800">
                                        Já existe uma anamnese aguardando resposta
                                    </p>
                                    <p className="text-xs text-amber-600">
                                        Template: <span className="font-medium">{pendingRecord.template?.title}</span>
                                    </p>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-amber-300 text-amber-700 hover:bg-amber-100"
                                        onClick={handleResend}
                                        disabled={generating}
                                    >
                                        {generating
                                            ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                            : <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                        }
                                        Reenviar novo link
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Modelo de Anamnese</Label>
                            {loadingTemplates ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando modelos...
                                </div>
                            ) : (
                                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione um modelo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Array.isArray(templates) ? templates : []).map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.title}
                                                {t.is_system_default && (
                                                    <Badge variant="outline" className="ml-2 text-[10px]">Padrão</Badge>
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Validade do Link</Label>
                            <Select value={expiresDays} onValueChange={setExpiresDays}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3">3 dias</SelectItem>
                                    <SelectItem value="7">7 dias (padrão)</SelectItem>
                                    <SelectItem value="14">14 dias</SelectItem>
                                    <SelectItem value="30">30 dias</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="p-4 rounded-xl bg-green-50 border border-green-200 flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                <Check className="w-4 h-4 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-green-800">Link gerado com sucesso!</p>
                                <p className="text-xs text-green-600 mt-0.5">
                                    Válido por {expiresDays} dias · Expira em{' '}
                                    {new Date(Date.now() + parseInt(expiresDays) * 86400000).toLocaleDateString('pt-BR')}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Link do formulário</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={generatedLink}
                                    readOnly
                                    className="text-xs font-mono bg-slate-50"
                                    onClick={(e) => e.target.select()}
                                />
                                <Button
                                    variant={copied ? 'default' : 'outline'}
                                    size="sm"
                                    className="shrink-0"
                                    onClick={handleCopy}
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => window.open(generatedLink, '_blank')}
                        >
                            <ExternalLink className="w-3.5 h-3.5 mr-2" />
                            Pré-visualizar formulário
                        </Button>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={handleClose}>Fechar</Button>
                    {step === 'select' && !pendingRecord && (
                        <Button onClick={handleGenerate} disabled={generating || !selectedTemplateId}>
                            {generating
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <Send className="w-4 h-4 mr-2" />
                            }
                            Gerar e Copiar Link
                        </Button>
                    )}
                    {step === 'link_ready' && (
                        <Button onClick={handleCopy} variant="default">
                            {copied ? <Check className="w-4 h-4 mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
                            {copied ? 'Copiado!' : 'Copiar Link'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
