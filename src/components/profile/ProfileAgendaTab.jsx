import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Calendar, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { updateClinicSettings, getClinicSettings } from '@/lib/supabase/profile-queries';

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
    
    const [formData, setFormData] = useState({
        startTime: '08:00',
        endTime: '18:00',
        workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        slotDuration: 60
    });

    useEffect(() => {
        loadSettings();
    }, [userId]);

    const loadSettings = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const settings = await getClinicSettings(userId);
            if (settings.agenda) {
                setFormData({
                    startTime: settings.agenda.startTime || '08:00',
                    endTime: settings.agenda.endTime || '18:00',
                    workingDays: settings.agenda.workingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    slotDuration: settings.agenda.slotDuration || 60
                });
            }
        } catch (error) {
            console.error('Error loading agenda settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDayToggle = (day) => {
        setFormData(prev => ({
            ...prev,
            workingDays: prev.workingDays.includes(day)
                ? prev.workingDays.filter(d => d !== day)
                : [...prev.workingDays, day]
        }));
    };

    const handleSave = async () => {
        if (!userId) return;
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
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível salvar as configurações.",
                variant: "destructive"
            });
        } finally {
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
                            <Input
                                id="startTime"
                                type="time"
                                value={formData.startTime}
                                onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="endTime">Horário de Término</Label>
                            <Input
                                id="endTime"
                                type="time"
                                value={formData.endTime}
                                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
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
                            <SelectTrigger>
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
                <Button onClick={handleSave} disabled={saving}>
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

