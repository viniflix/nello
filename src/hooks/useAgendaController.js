import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { format, isToday, isTomorrow, isThisWeek, isThisMonth, startOfDay, addDays, subDays, isSameDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createAppointmentWithFinance, updateAppointment } from '@/lib/supabase/agenda-queries';
import { getServices } from '@/lib/supabase/financial-queries';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { exportAgendaToPdf } from '@/lib/pdfUtils';

export function useAgendaController({ user }) {
    const { toast } = useToast();
    
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [services, setServices] = useState([]);
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
    const [askToRegisterPatient, setAskToRegisterPatient] = useState({ isOpen: false, name: '' });
    const [anamnesisModal, setAnamnesisModal] = useState({ open: false, patientId: null, patientName: '' });

    const normalizeAppointment = useCallback((appointment) => {
        const startValue = appointment?.start_time || appointment?.appointment_time || null;
        const startDate = startValue ? new Date(startValue) : null;
        const endDate = appointment?.end_time ? new Date(appointment.end_time) : null;
        const computedDuration = startDate && endDate
            ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
            : null;

        return {
            ...appointment,
            appointment_time: startValue,
            duration: Number(appointment?.duration || computedDuration || 60)
        };
    }, []);

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data: apptsData, error: apptsError } = await supabase
            .from('appointments')
            .select('*, patient:user_profiles!appointments_patient_id_fkey(name, id)')
            .eq('nutritionist_id', user.id)
            .limit(1000);

        if (apptsError) toast({ title: "Erro", description: apptsError.message, variant: "destructive" });
        else setAppointments((apptsData || []).map(normalizeAppointment));

        let patientsList = [];
        let loadError = null;
        const patientMap = new Map();

        try {
            const { data: links, error: errLinks } = await supabase
                .from('nutritionist_patients')
                .select('patient_id')
                .eq('nutritionist_id', user.id);

            if (!errLinks && links?.length) {
                const ids = links.map(l => l.patient_id).filter(Boolean);
                const { data: profiles } = await supabase
                    .from('user_profiles')
                    .select('id, name')
                    .in('id', ids);
                if (profiles) profiles.forEach(p => patientMap.set(p.id, p));
            } else if (errLinks) {
                loadError = errLinks;
            }

            const { data: fromProfiles, error: errProfiles } = await supabase
                .from('user_profiles')
                .select('id, name')
                .eq('nutritionist_id', user.id)
                .limit(500);

            if (!errProfiles && fromProfiles?.length) {
                fromProfiles.forEach(p => patientMap.set(p.id, p));
            } else if (errProfiles && !loadError) {
                loadError = errProfiles;
            }

            patientsList = Array.from(patientMap.values()).map(p => ({
                id: p.id,
                name: p.name || 'Paciente'
            }));
            
            if (patientsList.length === 0 && loadError) {
                toast({ title: "Erro", description: "Não foi possível carregar os pacientes. Verifique sua conexão.", variant: "destructive" });
            }
        } catch (e) {
            console.error('Error fetching patients:', e);
        }

        setPatients(patientsList);

        try {
            const servicesData = await getServices(user.id);
            setServices(servicesData || []);
        } catch (error) {
            console.error('Error loading services:', error);
            setServices([]);
        }

        setLoading(false);
    }, [user, toast, normalizeAppointment]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSaveAppointment = async (appointmentData, financialData) => {
        const { patient_id, unregistered_patient_name, appointment_time, notes, duration, appointment_type, status } = appointmentData;

        const startTime = new Date(appointment_time);
        const endTime = new Date(startTime.getTime() + duration * 60000);

        const hasConflict = appointments.some(appt => {
            if (appointmentData.id && appt.id === appointmentData.id) return false;

            const apptStart = new Date(appt.appointment_time);
            const apptEnd = new Date(apptStart.getTime() + (appt.duration || 60) * 60000);

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

        try {
            if (appointmentData.id) {
                await updateAppointment(appointmentData.id, {
                    nutritionist_id: user.id,
                    patient_id: patient_id || null,
                    unregistered_patient_name: unregistered_patient_name || null,
                    appointment_time,
                    notes,
                    duration: duration || 60,
                    appointment_type: appointment_type || 'first_appointment',
                    status: status || 'scheduled'
                });
                toast({ title: "Sucesso!", description: "Agendamento atualizado com sucesso." });
            } else {
                const payload = {
                    nutritionist_id: user.id,
                    patient_id: patient_id || null,
                    unregistered_patient_name: unregistered_patient_name || null,
                    appointment_time,
                    notes,
                    duration: duration || 60,
                    appointment_type: appointment_type || 'first_appointment',
                    status: status || 'scheduled'
                };

                const { transaction } = await createAppointmentWithFinance(payload, financialData);
                
                if (transaction) {
                    toast({ 
                        title: "Sucesso!", 
                        description: "Agendamento criado e registro financeiro gerado automaticamente." 
                    });
                } else {
                    toast({ 
                        title: "Sucesso!", 
                        description: "Agendamento criado com sucesso." 
                    });
                }

                if (!patient_id && unregistered_patient_name) {
                    setAskToRegisterPatient({
                        name: unregistered_patient_name,
                        isOpen: true
                    });
                }
            }

            setIsFormOpen(false);
            setEditingAppointment(null);
            loadData();
        } catch (error) {
            console.error('Error saving appointment:', error);
            const errMsg = error?.message || error?.details || (typeof error === 'string' ? error : '');
            toast({ 
                title: "Erro ao salvar", 
                description: toPortugueseError(errMsg || error, 'Não foi possível salvar o agendamento. Verifique se o paciente está vinculado a você.'), 
                variant: "destructive" 
            });
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

    const filteredAppointments = useMemo(() => {
        const now = new Date();
        let filtered = [...appointments].sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));

        if (selectedDate) {
            filtered = filtered.filter(a => isSameDay(new Date(a.appointment_time), selectedDate));
        } else {
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

        if (patientSearch.trim()) {
            const searchLower = patientSearch.toLowerCase();
            filtered = filtered.filter(a => {
                const name = a.patient?.name || a.unregistered_patient_name || '';
                return name.toLowerCase().includes(searchLower);
            });
        }

        return filtered;
    }, [appointments, filterView, selectedDate, patientSearch]);

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

    const appointmentsByDay = useMemo(() => {
        const counts = {};
        appointments.forEach(a => {
            const dateKey = format(new Date(a.appointment_time), 'yyyy-MM-dd');
            counts[dateKey] = (counts[dateKey] || 0) + 1;
        });
        return counts;
    }, [appointments]);

    const getDayColorClass = (date) => {
        const dateKey = format(date, 'yyyy-MM-dd');
        const count = appointmentsByDay[dateKey] || 0;

        if (count >= 5) {
            return 'bg-secondary/80 text-white font-bold hover:bg-secondary';
        } else if (count >= 3) {
            return 'bg-yellow-400/70 text-yellow-900 font-bold hover:bg-yellow-400';
        } else if (count >= 1) {
            return 'bg-primary/30 text-primary font-bold hover:bg-primary/40';
        }
        return '';
    };

    const getStatusInfo = (status) => {
        const statusMap = {
            'scheduled': { label: 'Agendada', variant: 'outline', color: 'text-blue-600 bg-blue-50' },
            'confirmed': { label: 'Confirmada', variant: 'default', color: 'text-green-600 bg-green-50' },
            'awaiting_confirmation': { label: 'Aguardando', variant: 'secondary', color: 'text-yellow-600 bg-yellow-50' },
            'completed': { label: 'Realizada', variant: 'secondary', color: 'text-gray-600 bg-gray-100' },
            'canceled': { label: 'Cancelada', variant: 'destructive', color: 'text-red-600 bg-red-50' },
            'cancelled': { label: 'Cancelada', variant: 'destructive', color: 'text-red-600 bg-red-50' },
            'no_show': { label: 'Faltou', variant: 'destructive', color: 'text-orange-600 bg-orange-50' }
        };
        return statusMap[status] || statusMap['scheduled'];
    };

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

    const getEndTime = (startTime, duration) => {
        const end = new Date(new Date(startTime).getTime() + (duration || 60) * 60000);
        return format(end, 'HH:mm');
    };

    const formatAppointmentDate = (dateString) => {
        const [year, month, day] = dateString.split('-').map(Number);
        const apptDate = new Date(year, month - 1, day);

        const weekday = format(apptDate, "EEEE", { locale: ptBR });
        const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        const fullDate = format(apptDate, "dd 'de' MMMM", { locale: ptBR });

        if (isToday(apptDate)) return `Hoje • ${weekdayCapitalized}, ${fullDate}`;
        if (isTomorrow(apptDate)) return `Amanhã • ${weekdayCapitalized}, ${fullDate}`;
        return `${weekdayCapitalized}, ${fullDate}`;
    };

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

    const handleCalendarSelect = (date) => {
        if (selectedDate && isSameDay(date, selectedDate)) {
            setSelectedDate(null);
        } else {
            setSelectedDate(date);
        }
    };

    const handleMobileCalendarSelect = (date) => {
        setSelectedDate(date);
        setMobileCalendarOpen(false);
    };

    const getCountColor = (count) => {
        if (count >= 5) {
            return 'text-secondary font-bold';
        } else if (count >= 3) {
            return 'text-yellow-600 font-bold';
        } else if (count >= 1) {
            return 'text-primary font-bold';
        }
        return 'text-muted-foreground font-bold';
    };

    const handleExportPDF = async () => {
        try {
            let periodLabel = '';
            let filteredExport = [];
            let startDate, endDate;

            if (exportPeriodType === 'week') {
                startDate = startOfWeek(exportWeekStart, { locale: ptBR });
                endDate = endOfWeek(exportWeekStart, { locale: ptBR });
                periodLabel = `Semana de ${format(startDate, 'dd/MM')} a ${format(endDate, 'dd/MM/yyyy')}`;

                filteredExport = appointments.filter(a => {
                    const apptDate = new Date(a.appointment_time);
                    return apptDate >= startDate && apptDate <= endDate;
                }).sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));
            } else {
                startDate = startOfMonth(exportMonth);
                endDate = endOfMonth(exportMonth);
                periodLabel = format(exportMonth, "MMMM 'de' yyyy", { locale: ptBR });
                periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);

                filteredExport = appointments.filter(a => {
                    const apptDate = new Date(a.appointment_time);
                    return apptDate >= startDate && apptDate <= endDate;
                }).sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));
            }

            if (filteredExport.length === 0) {
                toast({
                    title: "Sem agendamentos",
                    description: `Não há agendamentos para ${periodLabel.toLowerCase()}.`,
                    variant: "default"
                });
                return;
            }

            await exportAgendaToPdf(
                filteredExport,
                exportPeriodType,
                periodLabel,
                user?.profile?.name || user?.email?.split('@')[0] || null
            );

            toast({
                title: "PDF gerado!",
                description: `Agenda exportada com sucesso (${filteredExport.length} consultas).`,
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

    return {
        appointments,
        patients,
        services,
        selectedDate,
        isFormOpen,
        editingAppointment,
        loading,
        filterView,
        patientSearch,
        deleteConfirmOpen,
        appointmentToDelete,
        mobileCalendarOpen,
        exportDialogOpen,
        exportPeriodType,
        exportWeekStart,
        exportMonth,
        askToRegisterPatient,
        anamnesisModal,
        filteredAppointments,
        groupedAppointments,
        appointmentsByDay,
        
        setSelectedDate,
        setIsFormOpen,
        setEditingAppointment,
        setFilterView,
        setPatientSearch,
        setDeleteConfirmOpen,
        setAppointmentToDelete,
        setMobileCalendarOpen,
        setExportDialogOpen,
        setExportPeriodType,
        setExportWeekStart,
        setExportMonth,
        setAskToRegisterPatient,
        setAnamnesisModal,
        
        handleSaveAppointment,
        handleDeleteClick,
        handleDeleteAppointment,
        getDayColorClass,
        getStatusInfo,
        getTypeInfo,
        getEndTime,
        formatAppointmentDate,
        handlePreviousDay,
        handleNextDay,
        handleToday,
        handleClearDateFilter,
        handleCalendarSelect,
        handleMobileCalendarSelect,
        getCountColor,
        handleExportPDF,
        loadData
    };
}
