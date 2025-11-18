import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Plus, Clock, User, Edit, Trash2, Filter, CalendarDays, Eye, X, Search, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, isToday, isTomorrow, isThisWeek, isThisMonth, startOfDay, addDays, subDays, isSameDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { exportAgendaToPdf } from '@/lib/pdfUtils';

const AppointmentForm = ({ appointment, patients, onSave, onCancel, preSelectedDate }) => {
    const [formData, setFormData] = useState({
        patient_id: appointment?.patient_id || '',
        appointment_time_date: appointment
            ? format(new Date(appointment.appointment_time), 'yyyy-MM-dd')
            : preSelectedDate
                ? format(preSelectedDate, 'yyyy-MM-dd')
                : '',
        appointment_time_hour: appointment ? format(new Date(appointment.appointment_time), 'HH:mm') : '',
        duration: appointment?.duration || 60, // Duração padrão: 60 minutos
        appointment_type: appointment?.appointment_type || 'first_appointment', // Tipo padrão
        status: appointment?.status || 'scheduled', // Status padrão
        notes: appointment?.notes || ''
    });

    const [patientSearchTerm, setPatientSearchTerm] = useState(
        appointment?.patient_id ? patients.find(p => p.id === appointment.patient_id)?.name || '' : ''
    );
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

    const handleSubmit = (e) => {
        e.preventDefault();
        const [year, month, day] = formData.appointment_time_date.split('-').map(Number);
        const [hours, minutes] = formData.appointment_time_hour.split(':').map(Number);
        const appointment_time = new Date(year, month - 1, day, hours, minutes);
        onSave({
            ...appointment,
            ...formData,
            appointment_time: appointment_time.toISOString()
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
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

                {patientSearchTerm && filteredPatients.length === 0 && showPatientSuggestions && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                        Nenhum paciente encontrado
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="date">Data *</Label>
                    <Input id="date" type="date" required value={formData.appointment_time_date} onChange={e => setFormData(prev => ({ ...prev, appointment_time_date: e.target.value }))} />
                </div>
                <div>
                    <Label htmlFor="time">Hora *</Label>
                    <Input id="time" type="time" required value={formData.appointment_time_hour} onChange={e => setFormData(prev => ({ ...prev, appointment_time_hour: e.target.value }))} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="duration">Duração *</Label>
                    <Select required value={String(formData.duration)} onValueChange={(value) => setFormData(prev => ({ ...prev, duration: Number(value) }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {durationOptions.map(opt => <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label htmlFor="appointment_type">Tipo *</Label>
                    <Select required value={formData.appointment_type} onValueChange={(value) => setFormData(prev => ({ ...prev, appointment_type: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {appointmentTypes.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div>
                <Label htmlFor="status">Status *</Label>
                <Select required value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {statusOptions.map(status => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <div>
                <Label htmlFor="notes">Observações</Label>
                <Input id="notes" value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Informações adicionais (opcional)" />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
            </DialogFooter>
        </form>
    );
};

export default function AgendaPage() {
    const { user, signOut } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null); // null = todos os dias
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filterView, setFilterView] = useState('all'); // 'all', 'today', 'week', 'month'
    const [patientSearch, setPatientSearch] = useState(''); // Busca de paciente
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [appointmentToDelete, setAppointmentToDelete] = useState(null);
    const [mobileCalendarOpen, setMobileCalendarOpen] = useState(false); // Modal do calendário mobile
    const [exportDialogOpen, setExportDialogOpen] = useState(false); // Modal de exportação PDF
    const [exportPeriodType, setExportPeriodType] = useState('week'); // 'week' ou 'month'
    const [exportWeekStart, setExportWeekStart] = useState(startOfWeek(new Date(), { locale: ptBR }));
    const [exportMonth, setExportMonth] = useState(new Date());

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data: apptsData, error: apptsError } = await supabase
            .from('appointments')
            .select('*, patient:user_profiles!appointments_patient_id_fkey(name, id)')
            .eq('nutritionist_id', user.id)
            .limit(1000);

        if (apptsError) toast({ title: "Erro", description: apptsError.message, variant: "destructive" });
        else setAppointments(apptsData || []);

        const { data: patientsData, error: patientsError } = await supabase
            .from('user_profiles')
            .select('id, name')
            .eq('nutritionist_id', user.id)
            .limit(500);

        if (patientsError) toast({ title: "Erro", description: "Não foi possível carregar os pacientes.", variant: "destructive" });
        else setPatients(patientsData || []);
        setLoading(false);
    }, [user, toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSaveAppointment = async (data) => {
        const { patient_id, appointment_time, notes, duration, appointment_type, status } = data;

        // Validação de conflitos de horário
        const startTime = new Date(appointment_time);
        const endTime = new Date(startTime.getTime() + duration * 60000); // duration em minutos

        const hasConflict = appointments.some(appt => {
            // Ignora o próprio agendamento ao editar
            if (data.id && appt.id === data.id) return false;

            const apptStart = new Date(appt.appointment_time);
            const apptEnd = new Date(apptStart.getTime() + (appt.duration || 60) * 60000);

            // Verifica se há sobreposição
            return (startTime < apptEnd && endTime > apptStart);
        });

        if (hasConflict) {
            toast({
                title: "Conflito de Horário",
                description: "Já existe um agendamento neste horário. Por favor, escolha outro horário.",
                variant: "destructive"
            });
            return;
        }

        const payload = {
            nutritionist_id: user.id,
            patient_id,
            appointment_time,
            notes,
            duration: duration || 60,
            appointment_type: appointment_type || 'first_appointment',
            status: status || 'scheduled'
        };

        let query;
        if (data.id) {
            query = supabase.from('appointments').update(payload).eq('id', data.id);
        } else {
            query = supabase.from('appointments').insert(payload);
        }

        const { error } = await query;

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar o agendamento. ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: `Agendamento ${data.id ? 'atualizado' : 'criado'} com sucesso.` });
            setIsFormOpen(false);
            setEditingAppointment(null);
            loadData();
        }
    };

    const handleDeleteClick = (appointment) => {
        setAppointmentToDelete(appointment);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteAppointment = async () => {
        if (!appointmentToDelete) return;

        const { error } = await supabase.from('appointments').delete().eq('id', appointmentToDelete.id);
        if (error) {
            toast({ title: "Erro", description: "Não foi possível deletar o agendamento.", variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: "Agendamento deletado com sucesso." });
            loadData();
        }
        setDeleteConfirmOpen(false);
        setAppointmentToDelete(null);
    };

    // Filtrar agendamentos baseado na visualização selecionada, data e paciente
    const filteredAppointments = useMemo(() => {
        const now = new Date();
        let filtered = [...appointments].sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));

        // Filtrar por data selecionada no calendário (prioridade máxima)
        if (selectedDate) {
            filtered = filtered.filter(a => isSameDay(new Date(a.appointment_time), selectedDate));
        } else {
            // Se não tem data selecionada, filtrar por período
            switch (filterView) {
                case 'today':
                    filtered = filtered.filter(a => isToday(new Date(a.appointment_time)));
                    break;
                case 'week':
                    filtered = filtered.filter(a => isThisWeek(new Date(a.appointment_time), { locale: ptBR }));
                    break;
                case 'month':
                    filtered = filtered.filter(a => isThisMonth(new Date(a.appointment_time)));
                    break;
                default:
                    filtered = filtered.filter(a => new Date(a.appointment_time) >= startOfDay(now));
            }
        }

        // Filtrar por busca de paciente
        if (patientSearch.trim()) {
            const searchLower = patientSearch.toLowerCase();
            filtered = filtered.filter(a =>
                a.patient?.name?.toLowerCase().includes(searchLower)
            );
        }

        return filtered;
    }, [appointments, filterView, selectedDate, patientSearch]);

    // Agrupar agendamentos por data
    const groupedAppointments = useMemo(() => {
        const groups = {};
        filteredAppointments.forEach(appt => {
            const dateKey = format(new Date(appt.appointment_time), 'yyyy-MM-dd');
            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(appt);
        });
        return groups;
    }, [filteredAppointments]);

    // Contar agendamentos por dia e classificar por cor
    const appointmentsByDay = useMemo(() => {
        const counts = {};
        appointments.forEach(a => {
            const dateKey = format(new Date(a.appointment_time), 'yyyy-MM-dd');
            counts[dateKey] = (counts[dateKey] || 0) + 1;
        });
        return counts;
    }, [appointments]);

    // Função para determinar a cor do dia baseado na quantidade de agendamentos
    const getDayColorClass = (date) => {
        const dateKey = format(date, 'yyyy-MM-dd');
        const count = appointmentsByDay[dateKey] || 0;

        if (count >= 5) {
            // 5+ agendamentos: laranja forte
            return 'bg-secondary/80 text-white font-bold hover:bg-secondary';
        } else if (count >= 3) {
            // 3-4 agendamentos: amarelo
            return 'bg-yellow-400/70 text-yellow-900 font-bold hover:bg-yellow-400';
        } else if (count >= 1) {
            // 1-2 agendamentos: verde
            return 'bg-primary/30 text-primary font-bold hover:bg-primary/40';
        }
        return '';
    };

    // Função para pegar informações de status
    const getStatusInfo = (status) => {
        const statusMap = {
            'scheduled': { label: 'Agendada', variant: 'outline', color: 'text-blue-600 bg-blue-50' },
            'confirmed': { label: 'Confirmada', variant: 'default', color: 'text-green-600 bg-green-50' },
            'awaiting_confirmation': { label: 'Aguardando', variant: 'secondary', color: 'text-yellow-600 bg-yellow-50' },
            'completed': { label: 'Realizada', variant: 'secondary', color: 'text-gray-600 bg-gray-100' },
            'cancelled': { label: 'Cancelada', variant: 'destructive', color: 'text-red-600 bg-red-50' },
            'no_show': { label: 'Faltou', variant: 'destructive', color: 'text-orange-600 bg-orange-50' }
        };
        return statusMap[status] || statusMap['scheduled'];
    };

    // Função para pegar informações de tipo
    const getTypeInfo = (type) => {
        const typeMap = {
            'first_appointment': { label: 'Primeira Consulta' },
            'return': { label: 'Retorno' },
            'evaluation': { label: 'Avaliação' },
            'online': { label: 'Online' },
            'in_person': { label: 'Presencial' }
        };
        return typeMap[type] || typeMap['first_appointment'];
    };

    // Função para calcular horário de término
    const getEndTime = (startTime, duration) => {
        const end = new Date(new Date(startTime).getTime() + (duration || 60) * 60000);
        return format(end, 'HH:mm');
    };

    // Formatar data para exibição
    const formatAppointmentDate = (dateString) => {
        // Parse corretamente a data no formato yyyy-MM-dd sem problemas de timezone
        const [year, month, day] = dateString.split('-').map(Number);
        const apptDate = new Date(year, month - 1, day);

        const weekday = format(apptDate, "EEEE", { locale: ptBR });
        const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        const fullDate = format(apptDate, "dd 'de' MMMM", { locale: ptBR });

        if (isToday(apptDate)) return `Hoje • ${weekdayCapitalized}, ${fullDate}`;
        if (isTomorrow(apptDate)) return `Amanhã • ${weekdayCapitalized}, ${fullDate}`;
        return `${weekdayCapitalized}, ${fullDate}`;
    };

    // Funções para navegação de datas no mobile
    const handlePreviousDay = () => {
        const currentDate = selectedDate || new Date();
        setSelectedDate(subDays(currentDate, 1));
    };

    const handleNextDay = () => {
        const currentDate = selectedDate || new Date();
        setSelectedDate(addDays(currentDate, 1));
    };

    const handleToday = () => {
        setSelectedDate(new Date());
    };

    const handleClearDateFilter = () => {
        setSelectedDate(null);
    };

    // Handler para quando clica no calendário desktop
    const handleCalendarSelect = (date) => {
        if (selectedDate && isSameDay(date, selectedDate)) {
            // Se clicar na mesma data, limpa o filtro
            setSelectedDate(null);
        } else {
            setSelectedDate(date);
        }
    };

    // Handler para quando clica no calendário mobile
    const handleMobileCalendarSelect = (date) => {
        setSelectedDate(date);
        setMobileCalendarOpen(false); // Fecha o modal após selecionar
    };

    // Função para determinar a cor do contador baseado na quantidade
    const getCountColor = (count) => {
        if (count >= 5) {
            return 'text-secondary font-bold'; // Laranja
        } else if (count >= 3) {
            return 'text-yellow-600 font-bold'; // Amarelo
        } else if (count >= 1) {
            return 'text-primary font-bold'; // Verde
        }
        return 'text-muted-foreground font-bold'; // Cinza para 0
    };

    // Função para exportar agenda em PDF
    const handleExportPDF = async () => {
        try {
            let periodLabel = '';
            let filteredAppointments = [];
            let startDate, endDate;

            if (exportPeriodType === 'week') {
                startDate = startOfWeek(exportWeekStart, { locale: ptBR });
                endDate = endOfWeek(exportWeekStart, { locale: ptBR });
                periodLabel = `Semana de ${format(startDate, 'dd/MM')} a ${format(endDate, 'dd/MM/yyyy')}`;

                filteredAppointments = appointments.filter(a => {
                    const apptDate = new Date(a.appointment_time);
                    return apptDate >= startDate && apptDate <= endDate;
                }).sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));
            } else {
                startDate = startOfMonth(exportMonth);
                endDate = endOfMonth(exportMonth);
                periodLabel = format(exportMonth, "MMMM 'de' yyyy", { locale: ptBR });
                periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);

                filteredAppointments = appointments.filter(a => {
                    const apptDate = new Date(a.appointment_time);
                    return apptDate >= startDate && apptDate <= endDate;
                }).sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));
            }

            if (filteredAppointments.length === 0) {
                toast({
                    title: "Sem agendamentos",
                    description: `Não há agendamentos para ${periodLabel.toLowerCase()}.`,
                    variant: "default"
                });
                return;
            }

            await exportAgendaToPdf(
                filteredAppointments,
                exportPeriodType,
                periodLabel,
                user?.profile?.name || user?.email?.split('@')[0] || null
            );

            toast({
                title: "PDF gerado!",
                description: `Agenda exportada com sucesso (${filteredAppointments.length} consultas).`,
            });

            setExportDialogOpen(false);
        } catch (error) {
            console.error('Erro ao exportar PDF:', error);
            toast({
                title: "Erro ao exportar",
                description: "Não foi possível gerar o PDF. Tente novamente.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-8"
            >
                {/* Cabeçalho com Título e Descrição */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 text-center sm:text-left">
                    <div>
                        <h2 className="text-3xl font-bold font-heading uppercase tracking-wide text-primary">
                            Agenda de Consultas
                        </h2>
                        <p className="text-neutral-600 mt-1">
                            Visualize e gerencie todos os seus agendamentos.
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center sm:justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setExportDialogOpen(true)}
                            className="border-primary text-primary hover:bg-primary hover:text-white"
                        >
                            <FileDown className="w-4 h-4 mr-2" /> Exportar PDF
                        </Button>
                        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={() => setEditingAppointment(null)} className="bg-primary hover:bg-primary/90">
                                    <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{editingAppointment ? 'Editar' : 'Novo'} Agendamento</DialogTitle>
                                </DialogHeader>
                                <AppointmentForm
                                    appointment={editingAppointment}
                                    patients={patients}
                                    onSave={handleSaveAppointment}
                                    onCancel={() => setIsFormOpen(false)}
                                    preSelectedDate={selectedDate}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Selecionador de Data Mobile */}
                <div className="lg:hidden mb-6">
                    <Card className="bg-card shadow-card-dark rounded-xl">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handlePreviousDay}
                                    className="h-10 w-10 flex-shrink-0"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </Button>

                                <div className="flex-1 text-center">
                                    {selectedDate ? (
                                        <div>
                                            <p className="text-sm font-semibold text-primary">
                                                {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                                            </p>
                                            <p className="text-xs text-muted-foreground capitalize">
                                                {format(selectedDate, "EEEE", { locale: ptBR })}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-sm font-semibold text-muted-foreground">
                                            Todos os agendamentos
                                        </p>
                                    )}
                                </div>

                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleNextDay}
                                    className="h-10 w-10 flex-shrink-0"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="flex gap-2 mt-3">
                                <Button
                                    variant={selectedDate && isToday(selectedDate) ? "default" : "outline"}
                                    size="sm"
                                    onClick={handleToday}
                                    className="flex-1"
                                >
                                    Hoje
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMobileCalendarOpen(true)}
                                    className="flex-1"
                                >
                                    <CalendarIcon className="w-4 h-4 mr-1.5" />
                                    Calendário
                                </Button>
                                {selectedDate && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleClearDateFilter}
                                        className="flex-1"
                                    >
                                        Ver Todos
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Modal do Calendário Mobile */}
                <Dialog open={mobileCalendarOpen} onOpenChange={setMobileCalendarOpen}>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Selecionar Data</DialogTitle>
                            <DialogDescription>
                                Escolha uma data para ver os agendamentos
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex justify-center py-4">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={handleMobileCalendarSelect}
                                className="rounded-md border"
                                locale={ptBR}
                                modifiers={{
                                    today: (date) => isToday(date),
                                    highLoad: (date) => {
                                        const count = appointmentsByDay[format(date, 'yyyy-MM-dd')] || 0;
                                        return count >= 5 && !isToday(date);
                                    },
                                    mediumLoad: (date) => {
                                        const count = appointmentsByDay[format(date, 'yyyy-MM-dd')] || 0;
                                        return count >= 3 && count < 5 && !isToday(date);
                                    },
                                    lowLoad: (date) => {
                                        const count = appointmentsByDay[format(date, 'yyyy-MM-dd')] || 0;
                                        return count >= 1 && count < 3 && !isToday(date);
                                    }
                                }}
                                modifiersClassNames={{
                                    today: 'bg-primary text-white font-bold ring-2 ring-primary ring-offset-2 hover:bg-primary',
                                    highLoad: 'bg-secondary/80 text-white font-bold hover:bg-secondary',
                                    mediumLoad: 'bg-yellow-400/70 text-yellow-900 font-bold hover:bg-yellow-400',
                                    lowLoad: 'bg-primary/30 text-primary font-bold hover:bg-primary/40'
                                }}
                            />
                        </div>
                        <div className="space-y-2 pb-2">
                            <p className="text-xs font-semibold text-muted-foreground px-2">Legenda:</p>
                            <div className="grid grid-cols-3 gap-2 text-xs px-2">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded bg-primary/30 flex-shrink-0"></div>
                                    <span className="text-muted-foreground">1-2</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded bg-yellow-400/70 flex-shrink-0"></div>
                                    <span className="text-muted-foreground">3-4</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded bg-secondary/80 flex-shrink-0"></div>
                                    <span className="text-muted-foreground">5+</span>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Grid Principal - Layout invertido: 70% esquerda (agendamentos), 30% direita (calendário/resumo) */}
                <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                    {/* Lista de Agendamentos - 70% (7 colunas) */}
                    <div className="lg:col-span-7 order-1">
                        <Card className="bg-card shadow-card-dark rounded-xl">
                            <CardHeader className="pb-3">
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <CardTitle className="font-heading text-base lg:text-lg font-semibold text-primary">
                                            Agendamentos
                                        </CardTitle>
                                        <CardDescription className="text-xs lg:text-sm">
                                            {selectedDate && `Agendamentos de ${format(selectedDate, "dd/MM/yyyy")}`}
                                            {!selectedDate && filterView === 'all' && 'Todos os próximos agendamentos'}
                                            {!selectedDate && filterView === 'today' && 'Agendamentos de hoje'}
                                            {!selectedDate && filterView === 'week' && 'Agendamentos desta semana'}
                                            {!selectedDate && filterView === 'month' && 'Agendamentos deste mês'}
                                        </CardDescription>
                                    </div>

                                    {/* Filtros Desktop */}
                                    <div className="hidden lg:flex flex-col sm:flex-row gap-3">
                                        <Select value={filterView} onValueChange={setFilterView} disabled={!!selectedDate}>
                                            <SelectTrigger className="w-full sm:w-[180px]">
                                                <Filter className="w-4 h-4 mr-2" />
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos</SelectItem>
                                                <SelectItem value="today">Hoje</SelectItem>
                                                <SelectItem value="week">Esta Semana</SelectItem>
                                                <SelectItem value="month">Este Mês</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Buscar paciente..."
                                                value={patientSearch}
                                                onChange={(e) => setPatientSearch(e.target.value)}
                                                className="pl-9"
                                            />
                                        </div>

                                        {(patientSearch || selectedDate) && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setPatientSearch('');
                                                    setSelectedDate(null);
                                                }}
                                                className="w-full sm:w-auto"
                                            >
                                                <X className="w-4 h-4 mr-2" />
                                                Limpar Filtros
                                            </Button>
                                        )}
                                    </div>

                                    {/* Busca de Paciente Mobile */}
                                    <div className="lg:hidden relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar paciente..."
                                            value={patientSearch}
                                            onChange={(e) => setPatientSearch(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 lg:p-6">
                                {loading ? (
                                    <div className="flex justify-center items-center py-12">
                                        <p className="text-muted-foreground text-sm">Carregando agendamentos...</p>
                                    </div>
                                ) : Object.keys(groupedAppointments).length > 0 ? (
                                    <div className="space-y-4 lg:space-y-6">
                                        {Object.entries(groupedAppointments).map(([dateKey, dayAppointments]) => (
                                            <div key={dateKey} className="space-y-2 lg:space-y-3">
                                                {/* Cabeçalho do Dia - Escondido no mobile quando tem data selecionada */}
                                                {!selectedDate && (
                                                    <div className="flex items-center gap-2 lg:gap-3 pb-2 border-b">
                                                        <CalendarDays className="w-4 h-4 lg:w-5 lg:h-5 text-primary flex-shrink-0" />
                                                        <h3 className="font-semibold text-sm lg:text-base text-foreground capitalize truncate">
                                                            {formatAppointmentDate(dateKey)}
                                                        </h3>
                                                        <Badge
                                                            variant="secondary"
                                                            className={`ml-auto text-xs whitespace-nowrap border-0 ${
                                                                dayAppointments.length >= 5
                                                                    ? 'bg-secondary/80 text-white'
                                                                    : dayAppointments.length >= 3
                                                                        ? 'bg-yellow-400/70 text-yellow-900'
                                                                        : 'bg-primary/30 text-primary'
                                                            }`}
                                                        >
                                                            {dayAppointments.length}
                                                        </Badge>
                                                    </div>
                                                )}

                                                {/* Lista de Agendamentos do Dia */}
                                                <div className="space-y-2 lg:space-y-3">
                                                    {dayAppointments.map(appt => {
                                                        const statusInfo = getStatusInfo(appt.status || 'scheduled');
                                                        const typeInfo = getTypeInfo(appt.appointment_type || 'first_appointment');
                                                        const endTime = getEndTime(appt.appointment_time, appt.duration);

                                                        return (
                                                            <div
                                                                key={appt.id}
                                                                className="flex items-center gap-2 lg:gap-4 p-2.5 lg:p-4 bg-muted/30 hover:bg-muted/50 rounded-lg border border-border/50 transition-all hover:shadow-md"
                                                            >
                                                                {/* Horário - Compacto */}
                                                                <div className="flex flex-col items-center justify-center bg-primary/10 px-2 lg:px-3 py-1.5 lg:py-2 rounded-lg min-w-[55px] lg:min-w-[70px] flex-shrink-0">
                                                                    <Clock className="w-3 h-3 lg:w-4 lg:h-4 mb-0.5 lg:mb-1 text-primary" />
                                                                    <span className="text-xs lg:text-sm font-bold text-primary">
                                                                        {format(new Date(appt.appointment_time), 'HH:mm')}
                                                                    </span>
                                                                    <span className="text-[10px] lg:text-xs text-muted-foreground">
                                                                        {endTime}
                                                                    </span>
                                                                </div>

                                                                {/* Informações do Paciente */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-1.5 lg:gap-2 mb-0.5">
                                                                        <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-muted-foreground flex-shrink-0" />
                                                                        <p className="font-semibold text-sm lg:text-base text-foreground truncate">
                                                                            {appt.patient?.name || 'Paciente não identificado'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <Badge className={`text-xs ${statusInfo.color} border-0`}>
                                                                            {statusInfo.label}
                                                                        </Badge>
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {typeInfo.label}
                                                                        </span>
                                                                        {appt.notes && (
                                                                            <p className="text-xs text-muted-foreground line-clamp-1 hidden lg:block">
                                                                                • {appt.notes}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Ações - Compactas */}
                                                                <div className="flex gap-1 lg:gap-2 flex-shrink-0">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => navigate(`/nutritionist/patients/${appt.patient_id}/hub`)}
                                                                        className="h-8 w-8 lg:h-9 lg:w-9 hover:bg-blue-50 hover:text-blue-600"
                                                                        title="Ver detalhes do paciente"
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => {
                                                                            setEditingAppointment(appt);
                                                                            setIsFormOpen(true);
                                                                        }}
                                                                        className="h-8 w-8 lg:h-9 lg:w-9 hover:bg-primary/10 hover:text-primary"
                                                                        title="Editar agendamento"
                                                                    >
                                                                        <Edit className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 lg:h-9 lg:w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                        onClick={() => handleDeleteClick(appt)}
                                                                        title="Excluir agendamento"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-8 lg:py-12 text-center">
                                        <CalendarDays className="w-12 h-12 lg:w-16 lg:h-16 text-muted-foreground/50 mb-3 lg:mb-4" />
                                        <p className="text-muted-foreground font-medium text-sm lg:text-base mb-1 lg:mb-2">
                                            Nenhum agendamento encontrado
                                        </p>
                                        <p className="text-xs lg:text-sm text-muted-foreground">
                                            {patientSearch && 'Nenhum agendamento encontrado para esta busca'}
                                            {!patientSearch && selectedDate && 'Não há consultas agendadas para este dia'}
                                            {!patientSearch && !selectedDate && filterView === 'all' && 'Adicione um novo agendamento para começar'}
                                            {!patientSearch && !selectedDate && filterView === 'today' && 'Não há consultas agendadas para hoje'}
                                            {!patientSearch && !selectedDate && filterView === 'week' && 'Não há consultas agendadas para esta semana'}
                                            {!patientSearch && !selectedDate && filterView === 'month' && 'Não há consultas agendadas para este mês'}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Calendário e Resumo - 30% (3 colunas) - Desktop only */}
                    <div className="hidden lg:block lg:col-span-3 order-2 space-y-6">
                        {/* Calendário */}
                        <Card className="bg-card shadow-card-dark rounded-xl">
                            <CardHeader className="pb-3">
                                <CardTitle className="font-heading text-lg font-semibold text-primary">
                                    Calendário
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Clique em um dia para filtrar • Clique novamente para limpar
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center p-0 pb-3">
                                <div className="w-full flex justify-center">
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={handleCalendarSelect}
                                        className="w-fit"
                                        locale={ptBR}
                                        modifiers={{
                                            today: (date) => isToday(date),
                                            highLoad: (date) => {
                                                const count = appointmentsByDay[format(date, 'yyyy-MM-dd')] || 0;
                                                return count >= 5 && !isToday(date);
                                            },
                                            mediumLoad: (date) => {
                                                const count = appointmentsByDay[format(date, 'yyyy-MM-dd')] || 0;
                                                return count >= 3 && count < 5 && !isToday(date);
                                            },
                                            lowLoad: (date) => {
                                                const count = appointmentsByDay[format(date, 'yyyy-MM-dd')] || 0;
                                                return count >= 1 && count < 3 && !isToday(date);
                                            }
                                        }}
                                        modifiersClassNames={{
                                            today: 'bg-primary text-white font-bold ring-2 ring-primary ring-offset-2 hover:bg-primary',
                                            highLoad: 'bg-secondary/80 text-white font-bold hover:bg-secondary',
                                            mediumLoad: 'bg-yellow-400/70 text-yellow-900 font-bold hover:bg-yellow-400',
                                            lowLoad: 'bg-primary/30 text-primary font-bold hover:bg-primary/40'
                                        }}
                                    />
                                </div>

                                {/* Legenda das cores */}
                                <div className="w-full px-4 mt-3 border-t pt-3">
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">Legenda:</p>
                                    <div className="flex items-center gap-3 text-xs flex-wrap">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded bg-primary/30 flex-shrink-0"></div>
                                            <span className="text-muted-foreground whitespace-nowrap">1-2</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded bg-yellow-400/70 flex-shrink-0"></div>
                                            <span className="text-muted-foreground whitespace-nowrap">3-4</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded bg-secondary/80 flex-shrink-0"></div>
                                            <span className="text-muted-foreground whitespace-nowrap">5+</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Card de Resumo - Desktop only */}
                        <Card className="bg-card shadow-card-dark rounded-xl">
                            <CardHeader className="pb-3">
                                <CardTitle className="font-heading text-lg font-semibold text-primary">
                                    Resumo
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {(() => {
                                    const todayCount = appointments.filter(a => isToday(new Date(a.appointment_time))).length;
                                    const weekCount = appointments.filter(a => isThisWeek(new Date(a.appointment_time), { locale: ptBR })).length;
                                    const monthCount = appointments.filter(a => isThisMonth(new Date(a.appointment_time))).length;

                                    return (
                                        <>
                                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                                <span className="text-sm text-muted-foreground">Hoje</span>
                                                <span className={getCountColor(todayCount)}>
                                                    {todayCount}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                                <span className="text-sm text-muted-foreground">Esta Semana</span>
                                                <span className={getCountColor(weekCount)}>
                                                    {weekCount}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                                <span className="text-sm text-muted-foreground">Este Mês</span>
                                                <span className={getCountColor(monthCount)}>
                                                    {monthCount}
                                                </span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Dialog de Exportação para PDF */}
                <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Exportar Agenda em PDF</DialogTitle>
                            <DialogDescription>
                                Selecione o período que deseja exportar
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {/* Seleção de Tipo de Período */}
                            <div>
                                <Label htmlFor="period-type">Período</Label>
                                <Select value={exportPeriodType} onValueChange={setExportPeriodType}>
                                    <SelectTrigger id="period-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="week">Semana</SelectItem>
                                        <SelectItem value="month">Mês</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Seleção de Semana */}
                            {exportPeriodType === 'week' && (
                                <div>
                                    <Label>Selecionar Semana</Label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setExportWeekStart(subWeeks(exportWeekStart, 1))}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                        <div className="flex-1 text-center text-sm font-medium">
                                            {format(startOfWeek(exportWeekStart, { locale: ptBR }), 'dd/MM')} a{' '}
                                            {format(endOfWeek(exportWeekStart, { locale: ptBR }), 'dd/MM/yyyy')}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setExportWeekStart(addWeeks(exportWeekStart, 1))}
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setExportWeekStart(startOfWeek(new Date(), { locale: ptBR }))}
                                        className="w-full mt-2 text-xs"
                                    >
                                        Semana Atual
                                    </Button>
                                </div>
                            )}

                            {/* Seleção de Mês */}
                            {exportPeriodType === 'month' && (
                                <div>
                                    <Label>Selecionar Mês</Label>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setExportMonth(subMonths(exportMonth, 1))}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                        <div className="flex-1 text-center text-sm font-medium capitalize">
                                            {format(exportMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setExportMonth(addMonths(exportMonth, 1))}
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setExportMonth(new Date())}
                                        className="w-full mt-2 text-xs"
                                    >
                                        Mês Atual
                                    </Button>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setExportDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="button" onClick={handleExportPDF} className="bg-primary">
                                <FileDown className="w-4 h-4 mr-2" />
                                Exportar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Dialog de Confirmação de Exclusão */}
                <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja excluir o agendamento de{' '}
                                <strong>{appointmentToDelete?.patient?.name}</strong> para{' '}
                                <strong>
                                    {appointmentToDelete && format(new Date(appointmentToDelete.appointment_time), "dd/MM/yyyy 'às' HH:mm")}
                                </strong>?
                                <br /><br />
                                Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteAppointment} className="bg-destructive hover:bg-destructive/90">
                                Excluir
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </motion.div>
        </div>
    );
}