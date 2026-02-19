import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar, TimeInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
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
    onSave
}) {
    const [formData, setFormData] = useState({
        patient_id: '',
        appointment_time_date: preSelectedDate ? format(preSelectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
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
    const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);

    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(patientSearchTerm.toLowerCase())
    ).slice(0, 5);

    const appointmentTypes = [
        { value: 'first_appointment', label: 'Primeira Consulta' },
        { value: 'return', label: 'Retorno' },
        { value: 'evaluation', label: 'Avaliação' },
        { value: 'online', label: 'Online' },
        { value: 'in_person', label: 'Presencial' }
    ];

    const statusOptions = [
        { value: 'scheduled', label: 'Agendada' },
        { value: 'confirmed', label: 'Confirmada' },
        { value: 'awaiting_confirmation', label: 'Aguardando Confirmação' },
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
        if (appointment) {
            setFormData({
                patient_id: appointment.patient_id || '',
                appointment_time_date: appointment.appointment_time
                    ? format(new Date(appointment.appointment_time), 'yyyy-MM-dd')
                    : format(new Date(), 'yyyy-MM-dd'),
                appointment_time_hour: appointment.appointment_time
                    ? format(new Date(appointment.appointment_time), 'HH:mm')
                    : '',
                duration: appointment.duration || 60,
                appointment_type: appointment.appointment_type || 'first_appointment',
                status: appointment.status || 'scheduled',
                notes: appointment.notes || '',
                service_id: '',
                use_custom_price: false,
                custom_price: '',
                custom_description: ''
            });
            if (appointment.patient_id) {
                const patient = patients.find(p => p.id === appointment.patient_id);
                if (patient) {
                    setPatientSearchTerm(patient.name);
                }
            }
        } else {
            // Reset form
            setFormData({
                patient_id: '',
                appointment_time_date: preSelectedDate ? format(preSelectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
                appointment_time_hour: '',
                duration: 60,
                appointment_type: 'first_appointment',
                status: 'scheduled',
                notes: '',
                service_id: '',
                use_custom_price: false,
                custom_price: '',
                custom_description: ''
            });
            setPatientSearchTerm('');
        }
    }, [appointment, open, preSelectedDate, patients]);

    const handleServiceChange = (value) => {
        if (value === SERVICE_OPTION_CUSTOM) {
            setFormData(prev => ({
                ...prev,
                service_id: '',
                use_custom_price: true
            }));
        } else {
            const service = services.find(s => s.id.toString() === value);
            setFormData(prev => ({
                ...prev,
                service_id: value,
                use_custom_price: false,
                custom_price: '',
                custom_description: ''
            }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.patient_id || !formData.appointment_time_date || !formData.appointment_time_hour) {
            return;
        }

        const [year, month, day] = formData.appointment_time_date.split('-').map(Number);
        const [hours, minutes] = formData.appointment_time_hour.split(':').map(Number);
        const appointment_time = new Date(year, month - 1, day, hours, minutes);

        const appointmentData = {
            ...appointment,
            patient_id: formData.patient_id,
            appointment_time: appointment_time.toISOString(),
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

        onSave(appointmentData, financialData);
    };

    const selectedService = services.find(s => s.id.toString() === formData.service_id);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {appointment ? 'Editar Agendamento' : 'Novo Agendamento'}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Patient Search */}
                    <div className="relative">
                        <Label htmlFor="patient_search">Paciente *</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                id="patient_search"
                                type="text"
                                placeholder="Buscar paciente pelo nome..."
                                value={patientSearchTerm}
                                onChange={(e) => {
                                    setPatientSearchTerm(e.target.value);
                                    setShowPatientSuggestions(true);
                                    if (!e.target.value) {
                                        setFormData(prev => ({ ...prev, patient_id: '' }));
                                    }
                                }}
                                onFocus={() => setShowPatientSuggestions(true)}
                                className="pl-9"
                                required={!formData.patient_id}
                            />
                        </div>

                        {showPatientSuggestions && patientSearchTerm && filteredPatients.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                                {filteredPatients.map(patient => (
                                    <button
                                        key={patient.id}
                                        type="button"
                                        className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm"
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, patient_id: patient.id }));
                                            setPatientSearchTerm(patient.name);
                                            setShowPatientSuggestions(false);
                                        }}
                                    >
                                        {patient.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Date and Time */}
                    <div className="grid grid-cols-2 gap-4">
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
                                required
                                value={String(formData.duration)}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, duration: Number(value) }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {durationOptions.map(opt => (
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
                                required
                                value={formData.appointment_type}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, appointment_type: value }))}
                            >
                                <SelectTrigger>
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

                    {/* Status */}
                    <div>
                        <Label htmlFor="status">Status *</Label>
                        <Select
                            required
                            value={formData.status}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {statusOptions.map(status => (
                                    <SelectItem key={status.value} value={status.value}>
                                        {status.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

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
                                    value={formData.use_custom_price ? SERVICE_OPTION_CUSTOM : (formData.service_id || '')}
                                    onValueChange={handleServiceChange}
                                >
                                    <SelectTrigger>
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
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Informações adicionais (opcional)"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit">
                            {appointment ? 'Atualizar' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

