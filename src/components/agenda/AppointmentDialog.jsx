import { getTodayIsoDate, civilDateInZone, localTimeInZone, localDateTimeToInstant } from '@/lib/utils/date';
import React, { useState, useEffect, useRef } from 'react';
import { appointmentStatusChoices, canonicalAppointmentStatus, isTerminalAppointment } from '@/lib/agenda/appointment-rules';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar, TimeInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calendarDateKey, isOutsideAgendaSchedule } from '@/lib/agenda/availability';
import { useAgendaDayAvailability } from '@/hooks/useAgendaDayAvailability';
import { appointmentCharge } from '@/lib/agenda/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import AgendaPatientPicker from './AgendaPatientPicker';
import AgendaAvailabilityOptions from './AgendaAvailabilityOptions';
import { formatCurrency } from '@/lib/utils';

const SERVICE_OPTION_CUSTOM = 'custom';

export default function AppointmentDialog({
    open,
    onOpenChange,
    appointment,
    patients = [],
    services = [],
    nutritionistId,
    preSelectedDate,
    initialPatientId,
    onSave,
    onSearchPatients,
    agendaSettings,
    dayAvailability,
    referenceErrors = {}
}) {
    const [formData, setFormData] = useState({
        patient_id: '',
        unregistered_patient_name: '',
        appointment_time_date: preSelectedDate ? calendarDateKey(preSelectedDate) : getTodayIsoDate(),
        appointment_time_hour: '',
        duration: 60,
        appointment_type: 'first_appointment',
        status: 'scheduled',
        notes: '',
        // Financial fields
        service_id: '',
        use_custom_price: false,
        custom_price: '',
        custom_description: ''
    });

    const [patientSearchTerm, setPatientSearchTerm] = useState('');
    const initialized = useRef(null);
    const [outsideConfirmed, setOutsideConfirmed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const savingRef = useRef(false);
    const readOnly = !!appointment && isTerminalAppointment(appointment.status);
    const allowedStatuses = appointmentStatusChoices(appointment?.status);

    const appointmentTypes = [
        { value: 'first_appointment', label: 'Primeira Consulta' },
        { value: 'return', label: 'Retorno' },
        { value: 'evaluation', label: 'Avaliação' },
        { value: 'online', label: 'Online' },
        { value: 'in_person', label: 'Presencial' }
    ];

    const statusOptions = [
        { value: 'scheduled', label: 'Agendada' },
        { value: 'awaiting_confirmation', label: 'Aguardando confirmação' },
        { value: 'confirmed', label: 'Confirmada' },
        { value: 'completed', label: 'Realizada' },
        { value: 'cancelled', label: 'Cancelada' },
        { value: 'no_show', label: 'Faltou' }
    ];

    const durationOptions = [
        { value: 30, label: '30 minutos' },
        { value: 45, label: '45 minutos' },
        { value: 60, label: '1 hora' },
        { value: 90, label: '1h 30min' },
        { value: 120, label: '2 horas' }
    ];

    useEffect(() => {
        if (!open) { initialized.current = null; return; }
        const key = nutritionistId + ':' + (appointment?.id || 'new');
        if (initialized.current === key) return;
        initialized.current = key;
        setOutsideConfirmed(false);
        setSaveError('');
        if (appointment) {
            const appointmentStart = appointment.start_time || appointment.appointment_time;
            setFormData({
                patient_id: appointment.patient_id || '',
                unregistered_patient_name: appointment.unregistered_patient_name || '',
                appointment_time_date: appointmentStart
                    ? civilDateInZone(appointmentStart)
                    : getTodayIsoDate(),
                appointment_time_hour: appointmentStart
                    ? localTimeInZone(appointmentStart)
                    : '',
                duration: appointment.duration || 60,
                appointment_type: appointment.appointment_type || 'first_appointment',
                status: canonicalAppointmentStatus(appointment.status || 'scheduled'),
                notes: appointment.notes || '',
                service_id: '',
                use_custom_price: false,
                custom_price: '',
                custom_description: ''
            });
            if (appointment.patient_id) {
                const patient = patients.find(p => p.id === appointment.patient_id);
                setPatientSearchTerm(appointment.patient?.name || patient?.name || 'Paciente');
            } else if (appointment.unregistered_patient_name) {
                setPatientSearchTerm(appointment.unregistered_patient_name);
            }
        } else {
            const initialPatient = initialPatientId
                ? patients.find((patient) => patient.id === initialPatientId)
                : null;
            // Reset form
            setFormData({
                patient_id: initialPatient?.id || '',
                unregistered_patient_name: '',
                appointment_time_date: preSelectedDate ? calendarDateKey(preSelectedDate) : getTodayIsoDate(),
                appointment_time_hour: '',
                duration: Number(agendaSettings?.slotDuration) >= 1 && Number(agendaSettings?.slotDuration) <= 480 ? Number(agendaSettings.slotDuration) : 60,
                appointment_type: 'first_appointment',
                status: 'scheduled',
                notes: '',
                service_id: '',
                use_custom_price: false,
                custom_price: '',
                custom_description: ''
            });
            setPatientSearchTerm(initialPatient?.name || '');
        }
    }, [appointment, open, preSelectedDate, patients, initialPatientId, nutritionistId, agendaSettings]);

    // Restaurar pointer-events ao fechar (evita página travada quando Popover modal está dentro de Dialog)
    useEffect(() => {
        if (!open) {
            const t = setTimeout(() => { document.body.style.pointerEvents = ''; }, 100);
            return () => clearTimeout(t);
        }
    }, [open]);

    const localAvailability = useAgendaDayAvailability(nutritionistId, formData.appointment_time_date,
        open && !readOnly && dayAvailability?.date !== formData.appointment_time_date);
    const availability = dayAvailability?.date === formData.appointment_time_date ? dayAvailability : localAvailability;
    const charge = appointmentCharge(appointment);
    // Association belongs to the revision-checked linking flow, never an edit by name.
    const identityLocked = !!appointment;
    const unchangedInterval = !!appointment && civilDateInZone(appointment.appointment_time) === formData.appointment_time_date
        && localTimeInZone(appointment.appointment_time) === formData.appointment_time_hour && Number(appointment.duration || 60) === Number(formData.duration);
    const outsideSchedule = agendaSettings && !unchangedInterval && formData.status !== 'cancelled'
        && isOutsideAgendaSchedule(formData.appointment_time_date, formData.appointment_time_hour, formData.duration, agendaSettings);
    const workingDaysKey = JSON.stringify(agendaSettings?.workingDays);
    useEffect(() => setOutsideConfirmed(false), [formData.appointment_time_date, formData.appointment_time_hour, formData.duration, agendaSettings?.startTime, agendaSettings?.endTime, workingDaysKey]);

    const handleServiceChange = (value) => {
        if (value === SERVICE_OPTION_CUSTOM) {
            setFormData(prev => ({
                ...prev,
                service_id: '',
                use_custom_price: true
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                service_id: value,
                use_custom_price: false,
                custom_price: '',
                custom_description: ''
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (savingRef.current || readOnly) return;
        setSaveError('');

        // Must have EITHER a patient_id OR a typed registered name
        if (!formData.patient_id && !patientSearchTerm.trim()) {
            return;
        }

        if (!formData.appointment_time_date || !formData.appointment_time_hour) {
            return;
        }

        if (outsideSchedule && !outsideConfirmed) { setSaveError('Confirme a exceção de jornada ou escolha um horário sugerido.'); return; }
        savingRef.current = true;
        setSaving(true);
        try {
        const appointment_time = localDateTimeToInstant(`${formData.appointment_time_date}T${formData.appointment_time_hour}`);

        const appointmentData = {
            ...appointment,
            patient_id: formData.patient_id,
            unregistered_patient_name: formData.patient_id ? null : patientSearchTerm.trim(),
            appointment_time,
            notes: formData.notes,
            duration: formData.duration,
            appointment_type: formData.appointment_type,
            status: formData.status
        };

        const financialData = {
            service_id: formData.use_custom_price ? null : formData.service_id || null,
            custom_price: formData.use_custom_price ? formData.custom_price : null,
            custom_description: formData.use_custom_price ? formData.custom_description : null
        };

        const result = await onSave(appointmentData, financialData);
        if (result?.success === false) setSaveError(result.message || 'Não foi possível confirmar o salvamento. Confira os dados e tente novamente.');
        } catch {
            setSaveError('Não foi possível confirmar o salvamento. Confira a data, o horário e sua conexão antes de tentar novamente.');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const selectedService = services.find(s => s.id.toString() === formData.service_id);

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!savingRef.current) onOpenChange(nextOpen); }}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {readOnly ? 'Detalhes do agendamento' : appointment ? 'Editar Agendamento' : 'Novo Agendamento'}
                    </DialogTitle>
                    <DialogDescription>
                        {readOnly ? 'Este agendamento foi encerrado. Seus dados estão disponíveis para consulta.' : appointment ? 'Altere os dados do agendamento.' : 'Preencha os dados para agendar uma nova consulta.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4" aria-busy={saving}>
                    <fieldset disabled={saving || readOnly} className="space-y-4 min-w-0">
                    <AgendaPatientPicker value={patientSearchTerm} selectedId={formData.patient_id} disabled={saving || readOnly || identityLocked}
                        patients={patients} onSearch={onSearchPatients}
                        onChange={(name, id) => { setPatientSearchTerm(name); setFormData(previous => ({ ...previous, patient_id: appointment ? '' : id, unregistered_patient_name: id ? '' : name })); }} />
                    {identityLocked && <p className="text-xs text-muted-foreground">A identidade permanece vinculada a este agendamento. Para completar um cadastro pendente, use a ação de cadastro na lista.</p>}
                    {referenceErrors.patients && <p role="alert" className="text-xs text-destructive">Não foi possível carregar os pacientes. A busca pode ser tentada novamente; nenhum vínculo será escolhido automaticamente.</p>}

                    {/* Date and Time */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="date">Data *</Label>
                            <DateInputWithCalendar
                                id="date"
                                required
                                value={formData.appointment_time_date}
                                onChange={(value) => setFormData(prev => ({ ...prev, appointment_time_date: value }))}
                            />
                        </div>
                        <div>
                            <Label htmlFor="time">Hora *</Label>
                            <TimeInput
                                id="time"
                                required
                                value={formData.appointment_time_hour}
                                onChange={(value) => setFormData(prev => ({ ...prev, appointment_time_hour: value }))}
                            />
                        </div>
                    </div>

                    {/* Duration and Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="duration">Duração *</Label>
                            <Select
                                name="duration"
                                required
                                value={String(formData.duration)}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, duration: Number(value) }))}
                            >
                                <SelectTrigger id="duration" disabled={saving || readOnly}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...durationOptions, ...(!durationOptions.some(option => option.value === Number(formData.duration)) ? [{ value: Number(formData.duration), label: `${formData.duration} minutos` }] : [])].map(opt => (
                                        <SelectItem key={opt.value} value={String(opt.value)}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="appointment_type">Tipo *</Label>
                            <Select
                                name="appointment_type"
                                required
                                value={formData.appointment_type}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, appointment_type: value }))}
                            >
                                <SelectTrigger id="appointment_type" disabled={saving || readOnly}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {appointmentTypes.map(type => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {!readOnly && <AgendaAvailabilityOptions date={formData.appointment_time_date} duration={formData.duration} settings={agendaSettings} availability={availability}
                        appointmentId={appointment?.id} onChoose={time => { setFormData(previous => ({ ...previous, appointment_time_hour: time })); setOutsideConfirmed(false); }} />}
                    {outsideSchedule && !readOnly && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>Este horário ou duração está fora da jornada configurada.</p><Label htmlFor="agenda-outside-hours" className="mt-2 flex min-h-11 items-center gap-2"><Checkbox id="agenda-outside-hours" checked={outsideConfirmed} onCheckedChange={checked => setOutsideConfirmed(checked === true)} />Agendar fora da jornada neste atendimento</Label></div>}

                    {/* Status */}
                    <div>
                        <Label htmlFor="status">Status *</Label>
                        <Select
                            name="status"
                            required
                            disabled={saving || readOnly || !appointment}
                            value={formData.status}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                        >
                            <SelectTrigger id="status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {statusOptions.filter(status => allowedStatuses.includes(status.value)).map(status => (
                                    <SelectItem key={status.value} value={status.value}>
                                        {status.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {appointment && <section className="rounded-xl bg-muted/50 p-3 text-sm" aria-label="Cobrança vinculada">
                        <p className="font-medium">{charge ? 'Cobrança vinculada' : 'Sem cobrança vinculada'}</p>
                        {charge && <><p>{formatCurrency(charge.amount)} · {charge.status === 'paid' ? 'Paga' : charge.status === 'refunded' ? 'Estornada' : charge.status === 'overdue' ? 'Atrasada' : 'Pendente'}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{formData.status === 'cancelled' ? ['paid', 'refunded'].includes(charge.status) ? 'O pagamento e o histórico financeiro serão preservados.' : 'Ao cancelar, a cobrança será removida se ainda estiver pendente ou atrasada.' : ['pending', 'overdue'].includes(charge.status) ? 'Ao reagendar para outro dia, o vencimento e a competência da cobrança pendente acompanham a consulta.' : 'Reagendar preserva o pagamento. Ajustes são feitos no Financeiro.'}</p></>}
                    </section>}
                    {referenceErrors.services && !appointment && <p role="alert" className="text-xs text-destructive">Os serviços não foram carregados. Confira antes de selecionar uma cobrança; nenhum preço será presumido.</p>}
                    {/* Financial Section - Only for new appointments */}
                    {!appointment && (
                        <div className="border-t pt-4 space-y-4">
                            <div>
                                <Label className="text-base font-semibold">Informações Financeiras</Label>
                                <p className="text-sm text-muted-foreground">
                                    Selecione um serviço padrão ou defina um valor personalizado
                                </p>
                            </div>

                            {/* Service Select */}
                            <div>
                                <Label htmlFor="service">Serviço</Label>
                                <Select
                                    id="service"
                                    name="service"
                                    value={formData.use_custom_price ? SERVICE_OPTION_CUSTOM : (formData.service_id || '')}
                                    onValueChange={handleServiceChange}
                                >
                                    <SelectTrigger id="service">
                                        <SelectValue placeholder="Selecione um serviço ou valor personalizado" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {services.map(service => (
                                            <SelectItem key={service.id} value={service.id.toString()}>
                                                {service.name} - {formatCurrency(service.price)}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value={SERVICE_OPTION_CUSTOM}>
                                            💰 Valor Personalizado / Outro
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Service Price Display or Custom Price Input */}
                            {formData.use_custom_price ? (
                                <>
                                    <div>
                                        <Label htmlFor="custom_price">Valor Personalizado (R$) *</Label>
                                        <Input
                                            id="custom_price"
                                            name="custom_price"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            required={formData.use_custom_price}
                                            value={formData.custom_price}
                                            onChange={(e) => setFormData(prev => ({ ...prev, custom_price: e.target.value }))}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="custom_description">Descrição do Serviço</Label>
                                        <Input
                                            id="custom_description"
                                            name="custom_description"
                                            value={formData.custom_description}
                                            onChange={(e) => setFormData(prev => ({ ...prev, custom_description: e.target.value }))}
                                            placeholder="Ex: Consulta especializada"
                                        />
                                    </div>
                                </>
                            ) : selectedService ? (
                                <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-sm text-muted-foreground">Valor do serviço:</p>
                                    <p className="text-lg font-semibold text-primary">
                                        {formatCurrency(selectedService.price)}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <Label htmlFor="notes">Observações</Label>
                        <Input
                            id="notes"
                            name="notes"
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Informações adicionais (opcional)"
                        />
                    </div>

                    </fieldset>
                    {saveError && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{saveError}</p>}
                    <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                        <Button type="button" variant="outline" disabled={saving} className="min-h-11 transition-colors motion-reduce:transition-none" onClick={() => onOpenChange(false)}>
                            {readOnly ? 'Fechar' : 'Cancelar'}
                        </Button>
                        {!readOnly && <Button type="submit" disabled={saving} className="min-h-11 transition-colors motion-reduce:transition-none">
                            {saving ? 'Salvando…' : appointment ? 'Salvar alterações' : 'Agendar'}
                        </Button>}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
