import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { format, startOfDay, addDays, subDays, isSameDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createAppointmentWithFinance, updateAppointment, deleteAppointment } from '@/lib/supabase/agenda-queries';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { fetchAppointmentsInPeriod } from '@/lib/supabase/agenda-list-queries';
import { hasAppointmentConflict } from '@/lib/agenda/appointment-rules';

import { useAgendaReferences } from './useAgendaReferences';
import { useAgendaDayAvailability } from './useAgendaDayAvailability';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import { agendaToday, agendaPeriod, agendaCivilRange, calendarDateKey, instantInAgendaPeriod, agendaEndTime } from '@/lib/agenda/availability';
import { civilDateInZone, civilDateToDate, getTodayIsoDate } from '@/lib/utils/date';

export function useAgendaController({ user, returnView = null }) {
    const { toast } = useToast();
    
    const [appointments, setAppointments] = useState([]);
    const [summaryAppointments, setSummaryAppointments] = useState([]);
    const [summaryReady, setSummaryReady] = useState(false);
    const [agendaRevision, setAgendaRevision] = useState(0);
    const loadSequence = useRef(0);
    const references = useAgendaReferences(user?.id);
    const { patients, services } = references;
    const [selectedDate, setSelectedDate] = useState(() => returnView?.date ? civilDateToDate(returnView.date) : null); // null = todos os dias
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [summaryError, setSummaryError] = useState(false);
    const [calendarError, setCalendarError] = useState(false);
    const [exporting, setExporting] = useState(false);
    const exportLock = useRef(false);
    const [periodDate, setPeriodDate] = useState(() => returnView?.periodDate ? civilDateToDate(returnView.periodDate) : agendaToday());
    const [filterView, setFilterView] = useState(returnView?.view || 'all'); // 'all', 'today', 'week', 'month'
    const [patientSearch, setPatientSearch] = useState(''); // Busca de paciente
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deletingAppointment, setDeletingAppointment] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const deleteLock = useRef(false);
    const [appointmentToDelete, setAppointmentToDelete] = useState(null);
    const [mobileCalendarOpen, setMobileCalendarOpen] = useState(false); // Modal do calendário mobile
    const [calendarMonth, setCalendarMonth] = useState(startOfMonth(agendaToday()));
    const [calendarAppointments, setCalendarAppointments] = useState([]);
    const [exportDialogOpen, setExportDialogOpen] = useState(false); // Modal de exportação PDF
    const [exportPeriodType, setExportPeriodType] = useState('week'); // 'week' ou 'month'
    const [exportWeekStart, setExportWeekStart] = useState(startOfWeek(agendaToday(), { locale: ptBR }));
    const [exportMonth, setExportMonth] = useState(agendaToday());
    const [askToRegisterPatient, setAskToRegisterPatient] = useState({ isOpen: false, name: '' });
    const [anamnesisModal, setAnamnesisModal] = useState({ open: false, patientId: null, patientName: '' });

    useEffect(() => {
        if (selectedDate) setCalendarMonth(startOfMonth(selectedDate));
    }, [selectedDate]);

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
        const sequence = ++loadSequence.current;
        setLoading(true);
        setLoadError(false);
        const { start, end } = agendaPeriod(filterView, selectedDate, new Date(), periodDate);
        try {
            const apptsData = await fetchAppointmentsInPeriod(user.id, start, end);
            if (sequence === loadSequence.current) setAppointments(apptsData.map(normalizeAppointment));
        } catch (error) {
            if (sequence === loadSequence.current) { setLoadError(true); toast({ title: 'Erro', description: toPortugueseError(error, 'Não foi possível carregar a agenda.'), variant: 'destructive' }); }
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    }, [user, toast, normalizeAppointment, selectedDate, filterView, periodDate]);

    useEffect(() => {
        let cancelled = false;
        if (!user?.id) return;
        setCalendarError(false);
        fetchAppointmentsInPeriod(user.id, ...Object.values(agendaCivilRange(calendarMonth, new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))), 'id, appointment_time', 'agenda_calendar')
            .then(rows => { if (!cancelled) setCalendarAppointments(rows); })
            .catch(error => { if (!cancelled) { setCalendarError(true); logDiagnostic('error', 'hooks/useAgendaController.js:86', 'Falha ao carregar contagem do calendário', error); } });
        return () => { cancelled = true; };
    }, [user?.id, calendarMonth, agendaRevision]);

    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        setSummaryReady(false);
        setSummaryError(false);
        const now = agendaToday();
        const weekStart = startOfWeek(now, { locale: ptBR });
        const monthStart = startOfMonth(now);
        const weekEnd = addDays(startOfDay(endOfWeek(now, { locale: ptBR })), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        fetchAppointmentsInPeriod(
            user.id,
            ...Object.values(agendaCivilRange(weekStart < monthStart ? weekStart : monthStart, weekEnd > monthEnd ? weekEnd : monthEnd)),
            'id, appointment_time',
            'agenda_summary'
        ).then(rows => {
            if (!cancelled) {
                setSummaryAppointments(rows);
                setSummaryReady(true);
            }
        })
            .catch(error => { if (!cancelled) { setSummaryError(true); logDiagnostic('error', 'hooks/useAgendaController.js:111', 'Falha ao carregar resumo da agenda', error); } });
        return () => { cancelled = true; };
    }, [user?.id, agendaRevision]);

    const dayAvailability = useAgendaDayAvailability(user?.id, calendarDateKey(selectedDate || periodDate));
    useEffect(() => subscribeDomain(user?.id, 'clinical', () => setAgendaRevision(value => value + 1)), [user?.id]);

    useEffect(() => {
        loadData();
        return () => { loadSequence.current += 1; };
    }, [loadData, agendaRevision]);

    const handleSaveAppointment = async (appointmentData, financialData) => {
        const { patient_id, unregistered_patient_name, appointment_time, notes, duration, appointment_type, status } = appointmentData;

        const startTime = new Date(appointment_time);
        const endTime = new Date(startTime.getTime() + duration * 60000);

        try {
        const nearbyAppointments = await fetchAppointmentsInPeriod(user.id, new Date(startTime.getTime() - 24 * 60 * 60 * 1000), endTime, undefined, 'agenda_conflict');
        const hasConflict = hasAppointmentConflict(nearbyAppointments, appointmentData);

        if (hasConflict) {
            toast({
                title: "Conflito de Horário",
                description: "Já existe um agendamento neste horário. Por favor, escolha outro horário.",
                variant: "destructive"
            });
            return { success: false, message: 'Já existe um agendamento neste horário. Escolha outro horário.' };
        }

            if (appointmentData.id) {
                const savedAppointment = await updateAppointment(appointmentData.id, {
                    nutritionist_id: user.id,
                    patient_id: patient_id || null,
                    unregistered_patient_name: unregistered_patient_name || null,
                    appointment_time,
                    notes,
                    duration: duration || 60,
                    appointment_type: appointment_type || 'first_appointment',
                    status: status || 'scheduled',
                    updated_at: appointmentData.updated_at
                }, financialData);
                toast({ title: "Agendamento atualizado", description: savedAppointment?.appointment_notifications_pending
                    ? 'A consulta foi salva. A confirmação de aviso está pendente; não é necessário salvar novamente.'
                    : 'Agendamento atualizado com sucesso.' });
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

                const { appointment: createdAppointment, transaction } = await createAppointmentWithFinance(payload, financialData);
                
                if (createdAppointment.appointment_notifications_pending) {
                    toast({ title: 'Agendamento salvo', description: 'A confirmação do aviso está pendente. Confira Avisos da consulta; não é necessário salvar novamente.' });
                } else if (transaction) {
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
                        appointment: { ...createdAppointment, charge: transaction ? [transaction] : [] },
                        isOpen: true
                    });
                }
            }

            setIsFormOpen(false);
            setEditingAppointment(null);
            setAgendaRevision(revision => revision + 1);
            return { success: true };
        } catch (error) {
            logDiagnostic('error', 'hooks/useAgendaController.js:260', 'Error saving appointment:', error);
            const errMsg = error?.message || error?.details || (typeof error === 'string' ? error : '');
            const description = error?.code === '23P01' ? 'Este horário acabou de ser ocupado. Escolha outro horário.' : error?.code === 'PT409'
                ? 'Este agendamento mudou ou não está mais disponível. Feche e abra novamente para conferir a versão atual antes de salvar.'
                : toPortugueseError(errMsg || error, 'Não foi possível salvar o agendamento. Verifique se o paciente está vinculado a você.');
            toast({ 
                title: "Erro ao salvar", 
                description,
                variant: "destructive" 
            });
            return { success: false, message: description };
        }
    };

    const handleDeleteClick = (appointment) => {
        setDeleteError('');
        setAppointmentToDelete(appointment);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteAppointment = async () => {
        if (!appointmentToDelete || deleteLock.current) return;
        deleteLock.current = true;
        setDeletingAppointment(true);
        setDeleteError('');

        try {
            await deleteAppointment(appointmentToDelete.id);
            toast({ title: "Sucesso!", description: "Agendamento deletado com sucesso." });
            setAgendaRevision(revision => revision + 1);
            setDeleteConfirmOpen(false);
            setAppointmentToDelete(null);
        } catch (error) {
            const message = toPortugueseError(error, 'Não foi possível remover. Consultas com pagamento exigem ajuste manual.');
            setDeleteError(message);
            toast({ title: 'Erro', description: message, variant: 'destructive' });
        } finally {
            deleteLock.current = false;
            setDeletingAppointment(false);
        }
    };

    const filteredAppointments = useMemo(() => {
        const period = agendaPeriod(filterView, selectedDate, new Date(), periodDate);
        const search = patientSearch.trim().toLocaleLowerCase('pt-BR');
        return appointments.filter(appointment => instantInAgendaPeriod(appointment.appointment_time, period)
            && (!search || (appointment.patient?.name || appointment.unregistered_patient_name || '').toLocaleLowerCase('pt-BR').includes(search)));
    }, [appointments, filterView, selectedDate, patientSearch, periodDate]);

    const groupedAppointments = useMemo(() => {
        const groups = {};
        filteredAppointments.forEach(appt => {
            const dateKey = civilDateInZone(appt.appointment_time);
            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(appt);
        });
        return groups;
    }, [filteredAppointments]);

    const appointmentsByDay = useMemo(() => {
        const counts = {};
        calendarAppointments.forEach(a => {
            const dateKey = civilDateInZone(a.appointment_time);
            counts[dateKey] = (counts[dateKey] || 0) + 1;
        });
        return counts;
    }, [calendarAppointments]);

    const getDayColorClass = (date) => {
        const dateKey = calendarDateKey(date);
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

    const getEndTime = agendaEndTime;

    const formatAppointmentDate = (dateString) => {
        const [year, month, day] = dateString.split('-').map(Number);
        const apptDate = new Date(year, month - 1, day);

        const weekday = format(apptDate, "EEEE", { locale: ptBR });
        const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        const fullDate = format(apptDate, apptDate.getFullYear() === agendaToday().getFullYear() ? "dd 'de' MMMM" : "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

        if (dateString === getTodayIsoDate()) return `Hoje • ${weekdayCapitalized}, ${fullDate}`;
        if (dateString === calendarDateKey(addDays(agendaToday(), 1))) return `Amanhã • ${weekdayCapitalized}, ${fullDate}`;
        return `${weekdayCapitalized}, ${fullDate}`;
    };

    const handlePreviousDay = () => {
        const currentDate = selectedDate || agendaToday();
        setSelectedDate(subDays(currentDate, 1));
    };

    const handleNextDay = () => {
        const currentDate = selectedDate || agendaToday();
        setSelectedDate(addDays(currentDate, 1));
    };

    const handleToday = () => {
        setSelectedDate(agendaToday());
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
        if (exportLock.current) return;
        exportLock.current = true;
        setExporting(true);
        try {
            let periodLabel = '';
            let filteredExport = [];
            let startDate, endDate;

            if (exportPeriodType === 'week') {
                startDate = startOfWeek(exportWeekStart, { locale: ptBR });
                endDate = endOfWeek(exportWeekStart, { locale: ptBR });
                periodLabel = `Semana de ${format(startDate, 'dd/MM')} a ${format(endDate, 'dd/MM/yyyy')}`;

                filteredExport = await fetchAppointmentsInPeriod(user.id, ...Object.values(agendaCivilRange(startDate, addDays(endDate, 1))), undefined, 'agenda_export');
            } else {
                startDate = startOfMonth(exportMonth);
                endDate = endOfMonth(exportMonth);
                periodLabel = format(exportMonth, "MMMM 'de' yyyy", { locale: ptBR });
                periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);

                filteredExport = await fetchAppointmentsInPeriod(user.id, ...Object.values(agendaCivilRange(startDate, new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1))), undefined, 'agenda_export');
            }

            if (filteredExport.length === 0) {
                toast({
                    title: "Sem agendamentos",
                    description: `Não há agendamentos para ${periodLabel.toLowerCase()}.`,
                    variant: "default"
                });
                return;
            }

            const { exportAgendaToPdf } = await import('@/lib/pdfUtils');
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
            logDiagnostic('error', 'hooks/useAgendaController.js:487', 'Erro ao exportar PDF:', error);
            toast({
                title: "Erro ao exportar",
                description: "Não foi possível gerar o PDF. Tente novamente.",
                variant: "destructive"
            });
        }
        finally { exportLock.current = false; setExporting(false); }
    };

    return {
        periodDate, setPeriodDate, loadError, calendarError, summaryError, exporting,
        appointmentDateKey: civilDateInZone,
        reloadOverview: () => setAgendaRevision(value => value + 1),
        appointments,
        summaryAppointments,
        summaryReady,
        patients,
        services,
        agendaSettings: references.settings,
        referenceErrors: references.errors,
        referencesLoading: references.loading,
        searchPatients: references.searchPatients,
        reloadReferences: references.reload,
        dayAvailability,
        selectedDate,
        isFormOpen,
        editingAppointment,
        loading,
        filterView,
        patientSearch,
        deleteConfirmOpen,
        deletingAppointment,
        deleteError,
        appointmentToDelete,
        mobileCalendarOpen,
        calendarMonth,
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
        setCalendarMonth,
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
