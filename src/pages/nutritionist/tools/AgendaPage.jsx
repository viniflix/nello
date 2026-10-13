import React, { useEffect, useRef, useState } from 'react';
import AgendaWorkspace from '@/components/agenda/AgendaWorkspace';
import { ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { AnamnesisLinkModal } from '@/components/anamnesis/AnamnesisLinkModal';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AppointmentDialog from '@/components/agenda/AppointmentDialog';
import AgendaRegistrationDialog from '@/components/agenda/AgendaRegistrationDialog';
import { civilDateInZone, civilDateToDate, localTimeInZone } from '@/lib/utils/date';
import { agendaReturnContext, readAgendaReturn, appointmentCharge } from '@/lib/agenda/navigation';
import { formatCurrency } from '@/lib/utils';

import { useAgendaController } from '@/hooks/useAgendaController';

export default function AgendaPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [routePatientId, setRoutePatientId] = useState(null);
    const [routePatient, setRoutePatient] = useState(null);
    const routeActionHandledRef = useRef(false);

    const controller = useAgendaController({ user, returnView: readAgendaReturn(location.state?.agendaReturn, user?.id) });
    const {
        patients,
        services,
        agendaSettings,
        dayAvailability,
        searchPatients,
        referencesLoading,
        referenceErrors,
        selectedDate,
        isFormOpen,
        editingAppointment,
        loading,
        filterView,
        deleteConfirmOpen,
        deletingAppointment,
        deleteError,
        appointmentToDelete,
        exportDialogOpen,
        exportPeriodType,
        exportWeekStart,
        exportMonth,
        askToRegisterPatient,
        anamnesisModal,

        setSelectedDate,
        setIsFormOpen,
        setEditingAppointment,
        setDeleteConfirmOpen,
        setExportDialogOpen,
        setExportPeriodType,
        setExportWeekStart,
        setExportMonth,
        setAskToRegisterPatient,
        setAnamnesisModal,

        handleSaveAppointment,
        handleDeleteClick,
        handleDeleteAppointment,
        handleExportPDF,
        loadData,
        reloadReferences
    } = controller;

    useEffect(() => {
        if (searchParams.get('action') !== 'new') {
            routeActionHandledRef.current = false;
            return;
        }
        if (routeActionHandledRef.current || loading || referencesLoading) return;

        routeActionHandledRef.current = true;
        const requestedPatientId = searchParams.get('patientId');
        let active = true;
        const resolvePatient = async () => {
            let patient = null;
            try {
                if (requestedPatientId) patient = (await searchPatients('', 0, requestedPatientId)).patients[0] || null;
            } catch {
                // Leave the route intact for an explicit retry; never silently create a guest.
                if (active) routeActionHandledRef.current = false;
                return;
            }
            if (!active) return;
            setRoutePatient(patient);
            setRoutePatientId(patient?.id || null);
            setEditingAppointment(null);
            setIsFormOpen(true);
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('action');
            nextParams.delete('patientId');
            setSearchParams(nextParams, { replace: true });
        };
        void resolvePatient();
        return () => { active = false; routeActionHandledRef.current = false; };
    }, [loading, referencesLoading, searchPatients, searchParams, setEditingAppointment, setIsFormOpen, setSearchParams]);

    return (
        <div className="min-h-dvh bg-background">
            <div>
                <AgendaWorkspace controller={controller}
                    onNew={date => { setRoutePatientId(null); setRoutePatient(null); if (date) setSelectedDate(civilDateToDate(date)); setEditingAppointment(null); setIsFormOpen(true); }}
                    onSettings={() => navigate('/nutritionist/profile?tab=agenda', { state: { agendaReturn: agendaReturnContext(user?.id, selectedDate, filterView, controller.periodDate) } })}
                    onExport={() => setExportDialogOpen(true)}
                    onEdit={appointment => { setEditingAppointment(appointment); setIsFormOpen(true); }}
                    onDelete={handleDeleteClick}
                    onRegister={appointment => setAskToRegisterPatient({ isOpen: true, name: appointment.unregistered_patient_name, appointment })}
                    onPatient={appointment => navigate(`/nutritionist/patients/${appointment.patient_id}/hub`)}
                    onAnamnesis={appointment => setAnamnesisModal({ open: true, patientId: appointment.patient_id, patientName: appointment.patient?.name || 'Paciente' })}
                    onCharge={appointment => navigate('/nutritionist/financial', { state: { agendaReturn: agendaReturnContext(user?.id, selectedDate, filterView, controller.periodDate), agendaTransactionId: appointmentCharge(appointment).id } })}
                />
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
                        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                            <Button type="button" variant="outline" onClick={() => setExportDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="button" onClick={handleExportPDF} disabled={controller.exporting} className="min-h-11 bg-primary">
                                <FileDown className="w-4 h-4 mr-2" />
                                Exportar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Appointment Dialog */}
                <AppointmentDialog
                    open={isFormOpen}
                    onOpenChange={(open) => {
                        setIsFormOpen(open);
                        if (!open) setRoutePatientId(null);
                    }}
                    appointment={editingAppointment}
                    patients={routePatient && !patients.some(patient => patient.id === routePatient.id) ? [routePatient, ...patients] : patients}
                    services={services}
                    agendaSettings={agendaSettings}
                    dayAvailability={dayAvailability}
                    onSearchPatients={searchPatients}
                    referenceErrors={referenceErrors}
                    nutritionistId={user?.id}
                    preSelectedDate={selectedDate}
                    initialPatientId={routePatientId}
                    onSave={handleSaveAppointment}
                />

                {/* Dialog de Confirmação de Exclusão */}
                <AlertDialog open={deleteConfirmOpen} onOpenChange={open => { if (!deletingAppointment) setDeleteConfirmOpen(open); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja excluir o agendamento de{' '}
                                <strong>{appointmentToDelete?.patient?.name || appointmentToDelete?.unregistered_patient_name}</strong> para{' '}
                                <strong>
                                    {appointmentToDelete && `${format(civilDateToDate(civilDateInZone(appointmentToDelete.appointment_time)), 'dd/MM/yyyy')} às ${localTimeInZone(appointmentToDelete.appointment_time)}`}
                                </strong>?
                                <br /><br />
                                Esta ação não pode ser desfeita.
                                {appointmentCharge(appointmentToDelete) && <span className="mt-2 block">Cobrança {formatCurrency(appointmentCharge(appointmentToDelete).amount)}: a pendente será removida junto com o agendamento. Pagamentos registrados impedem a exclusão; o histórico será preservado.</span>}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deletingAppointment} className="min-h-11">Cancelar</AlertDialogCancel>
                            <AlertDialogAction disabled={deletingAppointment} onClick={event => { event.preventDefault(); void handleDeleteAppointment(); }} className="min-h-11 bg-destructive hover:bg-destructive/90">
                                {deletingAppointment ? 'Excluindo…' : 'Excluir'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <AgendaRegistrationDialog open={askToRegisterPatient.isOpen}
                    onOpenChange={value => setAskToRegisterPatient(previous => ({ ...previous, isOpen: value }))}
                    appointmentId={askToRegisterPatient.appointment?.id} userId={user?.id}
                    name={askToRegisterPatient.name} patients={patients} searchPatients={searchPatients}
                    onLinked={async () => { await Promise.all([loadData(), reloadReferences()]); }} />
                {/* Sprint F: Modal de envio de anamnese */}
                <AnamnesisLinkModal
                    open={anamnesisModal.open}
                    onOpenChange={(val) => setAnamnesisModal(prev => ({ ...prev, open: val }))}
                    patientId={anamnesisModal.patientId}
                    patientName={anamnesisModal.patientName}
                />
            </div>
        </div>
    );
}
