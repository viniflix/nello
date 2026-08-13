import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCheckins } from '@/hooks/useCheckins';
import { useToast } from '@/components/ui/use-toast';
import { FormSkeleton } from '@/components/ui/custom-skeletons';
import CheckinTemplateBuilder from '@/components/nutritionist/CheckinTemplateBuilder';

export default function CheckinEditorPage() {
    const navigate = useNavigate();
    const { templateId } = useParams();
    const { toast } = useToast();
    const { getTemplate, createTemplate, updateTemplate } = useCheckins();

    const [isLoading, setIsLoading] = useState(!!templateId);
    const [isSaving, setIsSaving] = useState(false);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [frequency, setFrequency] = useState('weekly');
    const [sendTime, setSendTime] = useState('09:00');
    const [channel, setChannel] = useState('in_app');
    
    const [fields, setFields] = useState([
        { label: 'Como você avalia sua adesão à dieta nesta semana?', field_type: 'scale_1_10', options: [], score_weight: 1.0, is_required: true }
    ]);

    useEffect(() => {
        if (templateId) {
            getTemplate(templateId).then(data => {
                setName(data.name || '');
                setDescription(data.description || '');
                setFrequency(data.frequency || 'weekly');
                setSendTime(data.send_time ? data.send_time.substring(0, 5) : '09:00');
                setChannel(data.channel || 'in_app');
                if (data.checkin_fields && data.checkin_fields.length > 0) {
                    setFields(data.checkin_fields);
                }
                setIsLoading(false);
            }).catch(err => {
                toast({ title: 'Erro', description: 'Template não encontrado', variant: 'destructive' });
                navigate('/nutritionist/templates?group=forms&ftab=checkins');
            });
        }
    }, [templateId, getTemplate, navigate, toast]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            toast({ title: 'Erro', description: 'Dê um nome ao check-in.', variant: 'destructive' });
            return;
        }
        setIsSaving(true);
        try {
            const templateData = { name, description, frequency, send_time: sendTime, send_days: [1], channel };
            if (templateId) {
                await updateTemplate.mutateAsync({ id: templateId, template: templateData, fields });
            } else {
                await createTemplate.mutateAsync({ template: templateData, fields });
            }
            navigate('/nutritionist/templates?group=forms&ftab=checkins');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="container mx-auto p-4 sm:p-6 max-w-[1400px]">
                <FormSkeleton />
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 max-w-[1000px] min-h-[calc(100vh-80px)] flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/nutritionist/templates?group=forms&ftab=checkins')}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{templateId ? 'Editar Check-in' : 'Novo Check-in'}</h1>
                        <p className="text-sm text-slate-500">Configure as perguntas e a recorrência automática.</p>
                    </div>
                </div>
                <Button className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto" onClick={handleSave} disabled={isSaving || fields.length === 0}>
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Check-in
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col p-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="font-semibold">Nome do Template</Label>
                            <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Relato Semanal de Adesão" />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-semibold">Descrição (opcional)</Label>
                            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Apenas para seu controle..." />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-semibold">Frequência de Envio</Label>
                            <Select value={frequency} onValueChange={setFrequency}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">Diariamente</SelectItem>
                                    <SelectItem value="weekly">Semanalmente</SelectItem>
                                    <SelectItem value="biweekly">A cada 15 dias</SelectItem>
                                    <SelectItem value="monthly">Mensalmente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="font-semibold">Horário de Envio</Label>
                            <Input type="time" required value={sendTime} onChange={e => setSendTime(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-semibold">Canal de Disparo</Label>
                            <Select value={channel} onValueChange={setChannel}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="in_app">App HipoZero (Notificação)</SelectItem>
                                    <SelectItem value="whatsapp">WhatsApp (Requer integração)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Settings2 className="w-5 h-5 text-slate-500" />
                        <h2 className="text-lg font-bold text-slate-800">Campos do Check-in</h2>
                    </div>
                    <CheckinTemplateBuilder fields={fields} setFields={setFields} />
                </div>
            </div>
        </div>
    );
}
