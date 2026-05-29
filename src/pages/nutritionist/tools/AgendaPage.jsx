import React from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Plus, Clock, User, Edit, Trash2, Filter, CalendarDays, Eye, X, Search, ChevronLeft, ChevronRight, FileDown, ClipboardList } from 'lucide-react';
import { AnamnesisLinkModal } from '@/components/anamnesis/AnamnesisLinkModal';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, isToday, isThisWeek, isThisMonth, startOfWeek, endOfWeek, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import AppointmentDialog from '@/components/agenda/AppointmentDialog';

import { useAgendaController } from '@/hooks/useAgendaController';

export default function AgendaPage() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    
    const {
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
        handleExportPDF
    } = useAgendaController({ user });

    return (
        <div className="min-h-screen bg-background overflow-x-hidden">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-4 md:pt-8 min-w-0 overflow-x-hidden"
            >
                {/* Cabeçalho com Título e Descrição */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 md:mb-8 text-center sm:text-left">
                    <div className="min-w-0">
                        <h2 className="text-2xl md:text-3xl font-bold font-heading uppercase tracking-wide text-primary break-words">
                            Agenda de Consultas
                        </h2>
                        <p className="text-neutral-600 mt-1 text-sm md:text-base">
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
                        <Button 
                            onClick={() => {
                                setEditingAppointment(null);
                                setIsFormOpen(true);
                            }} 
                            className="bg-primary hover:bg-primary/90"
                        >
                            <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
                        </Button>
                    </div>
                </div>

                {/* Selecionador de Data Mobile */}
                <div className="lg:hidden mb-6">
                    <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
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
                    <div className="lg:col-span-7 order-1 min-w-0">
                        <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
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
                                                                            {appt.patient?.name || appt.unregistered_patient_name || 'Paciente não identificado'}
                                                                        </p>
                                                                        {!appt.patient_id && appt.unregistered_patient_name && (
                                                                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">
                                                                                Não Cadastrado
                                                                            </Badge>
                                                                        )}
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
                                                                    {appt.patient_id ? (
                                                                        <>
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
                                                                                onClick={() => setAnamnesisModal({
                                                                                    open: true,
                                                                                    patientId: appt.patient_id,
                                                                                    patientName: appt.patient?.name || 'Paciente',
                                                                                })}
                                                                                className="h-8 w-8 lg:h-9 lg:w-9 hover:bg-green-50 hover:text-green-600"
                                                                                title="Enviar formulário de anamnese"
                                                                            >
                                                                                <ClipboardList className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                                                            </Button>
                                                                        </>
                                                                    ) : (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => setAskToRegisterPatient({ isOpen: true, name: appt.unregistered_patient_name })}
                                                                            className="h-8 w-8 lg:h-9 lg:w-9 hover:bg-amber-50 hover:text-amber-600"
                                                                            title="Cadastrar Paciente"
                                                                        >
                                                                            <User className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                                                        </Button>
                                                                    )}
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

                {/* Appointment Dialog */}
                <AppointmentDialog
                    open={isFormOpen}
                    onOpenChange={setIsFormOpen}
                    appointment={editingAppointment}
                    patients={patients}
                    services={services}
                    nutritionistId={user?.id}
                    preSelectedDate={selectedDate}
                    onSave={handleSaveAppointment}
                />

                {/* Dialog de Confirmação de Exclusão */}
                <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja excluir o agendamento de{' '}
                                <strong>{appointmentToDelete?.patient?.name || appointmentToDelete?.unregistered_patient_name}</strong> para{' '}
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

                {/* Dialog para Cadastrar Paciente Não Registrado */}
                <AlertDialog open={askToRegisterPatient.isOpen} onOpenChange={(val) => setAskToRegisterPatient(prev => ({ ...prev, isOpen: val }))}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Paciente Não Cadastrado</AlertDialogTitle>
                            <AlertDialogDescription>
                                O agendamento para <strong>{askToRegisterPatient.name}</strong> foi criado com sucesso. <br /><br />
                                No entanto, este paciente ainda não possui cadastro no sistema. Deseja cadastrá-lo e enviá-lo um convite agora?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Agora não</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={() => navigate(`/nutritionist/patients?addPatientName=${encodeURIComponent(askToRegisterPatient.name)}`)} 
                                className="bg-primary hover:bg-primary/90"
                            >
                                Cadastrar Paciente
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Sprint F: Modal de envio de anamnese */}
                <AnamnesisLinkModal
                    open={anamnesisModal.open}
                    onOpenChange={(val) => setAnamnesisModal(prev => ({ ...prev, open: val }))}
                    patientId={anamnesisModal.patientId}
                    patientName={anamnesisModal.patientName}
                />
            </motion.div>
        </div>
    );
}