import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TimeInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Calendar, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { updateClinicSettings, getClinicSettings } from '@/lib/supabase/profile-queries';
import { readAgendaSettings, validateAgendaSettings } from '@/lib/agenda/availability';

const DAYS_OF_WEEK = [
    { value: 'monday', label: 'Segunda-feira' },
    { value: 'tuesday', label: 'Terça-feira' },
    { value: 'wednesday', label: 'Quarta-feira' },
    { value: 'thursday', label: 'Quinta-feira' },
    { value: 'friday', label: 'Sexta-feira' },
    { value: 'saturday', label: 'Sábado' },
    { value: 'sunday', label: 'Domingo' }
];

const SLOT_DURATIONS = [
    { value: 30, label: '30 minutos' },
    { value: 45, label: '45 minutos' },
    { value: 60, label: '1 hora' },
    { value: 90, label: '1 hora e 30 minutos' }
];

export default function ProfileAgendaTab({ userId, onUpdate }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [settingsError, setSettingsError] = useState('');
    const [loadFailed, setLoadFailed] = useState(false);
    const loadSequence = useRef(0);
    const savingRef = useRef(false);
    
    const [formData, setFormData] = useState({
        startTime: '08:00',
        endTime: '18:00',
        workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        slotDuration: 60
    });

    const loadSettings = useCallback(async () => {
        if (!userId) return;
        const sequence = ++loadSequence.current;
        setLoading(true);
        setLoadFailed(false);
        try {
            const settings = await getClinicSettings(userId);
            if (sequence !== loadSequence.current) return;
            const agenda = readAgendaSettings(settings);
            setFormData(agenda.settings);
            setSettingsError(agenda.errors.join(' '));
        } catch (error) {
            if (sequence !== loadSequence.current) return;
            logDiagnostic('error', 'components/profile/ProfileAgendaTab.jsx:59', 'Error loading agenda settings:', error);
            setLoadFailed(true);
            setSettingsError('Não foi possível carregar sua jornada. Tente novamente antes de salvar.');
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void loadSettings();
        return () => { loadSequence.current += 1; };
    }, [loadSettings]);

    const handleDayToggle = (day) => {
        setFormData(prev => ({
            ...prev,
            workingDays: prev.workingDays.includes(day)
                ? prev.workingDays.filter(d => d !== day)
                : [...prev.workingDays, day]
        }));
    };

    const handleSave = async () => {
        if (!userId || savingRef.current || loadFailed || loading) return;
        const errors = validateAgendaSettings(formData);
        setSettingsError(errors.join(' '));
        if (errors.length) return;
        savingRef.current = true;
        setSaving(true);
        try {
            await updateClinicSettings(userId, {
                agenda: {
                    startTime: formData.startTime,
                    endTime: formData.endTime,
                    workingDays: formData.workingDays,
                    slotDuration: formData.slotDuration
                }
            });

            toast({
                title: "Configurações salvas!",
                description: "As configurações de agenda foram atualizadas com sucesso."
            });

            if (onUpdate) onUpdate();
        } catch {
            toast({
                title: "Erro",
                description: "Não foi possível salvar as configurações.",
                variant: "destructive"
            });
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {settingsError && <div role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{settingsError}{loadFailed && <Button variant="outline" onClick={loadSettings} className="mt-2 min-h-11">Tentar novamente</Button>}</div>}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Horário de Funcionamento
                    </CardTitle>
                    <CardDescription>
                        Defina os horários de atendimento do seu consultório
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="startTime">Horário de Início</Label>
                            <TimeInput
                                id="startTime"
                                value={formData.startTime}
                                onChange={(value) => setFormData(prev => ({ ...prev, startTime: value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="endTime">Horário de Término</Label>
                            <TimeInput
                                id="endTime"
                                value={formData.endTime}
                                onChange={(value) => setFormData(prev => ({ ...prev, endTime: value }))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Dias da Semana
                    </CardTitle>
                    <CardDescription>
                        Selecione os dias em que você atende
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {DAYS_OF_WEEK.map(day => (
                            <div key={day.value} className="flex items-center space-x-2">
                                <Checkbox
                                    id={day.value}
                                    checked={formData.workingDays.includes(day.value)}
                                    onCheckedChange={() => handleDayToggle(day.value)}
                                />
                                <Label
                                    htmlFor={day.value}
                                    className="text-sm font-normal cursor-pointer"
                                >
                                    {day.label}
                                </Label>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Duração dos Slots</CardTitle>
                    <CardDescription>
                        Tempo padrão de cada consulta/agendamento
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label htmlFor="slotDuration">Duração (minutos)</Label>
                        <Select
                            value={formData.slotDuration.toString()}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, slotDuration: parseInt(value) }))}
                        >
                            <SelectTrigger id="slotDuration">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SLOT_DURATIONS.map(duration => (
                                    <SelectItem key={duration.value} value={duration.value.toString()}>
                                        {duration.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
                <Button onClick={handleSave} disabled={saving || loadFailed} className="min-h-11">
                    {saving ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Salvando...
                        </>
                    ) : (
                        'Salvar Configurações'
                    )}
                </Button>
            </div>
        </div>
    );
}

