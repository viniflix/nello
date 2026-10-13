import { useState } from 'react';
import { addDays, addMonths, format, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, Plus, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { agendaToday, agendaSummary, calendarDateKey, isAgendaTodayDate, availableAgendaSlots, agendaDayOccupancy } from '@/lib/agenda/availability';
import AgendaAppointmentCard from './AgendaAppointmentCard';
import './agenda-workspace.css';

const views = [['today', 'Dia'], ['week', 'Semana'], ['month', 'Mês'], ['all', 'Lista']];
function SectionError({ text, onRetry }) { return <div role="alert" className="agenda-section-error"><p>{text}</p><Button variant="outline" onClick={onRetry}>Tentar novamente</Button></div>; }

export default function AgendaWorkspace({ controller: c, onNew, onSettings, onExport, onEdit, onDelete, onRegister, onPatient, onAnamnesis, onCharge }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const anchor = c.selectedDate || c.periodDate || agendaToday();
  const mode = c.selectedDate ? 'today' : c.filterView;
  const counts = agendaSummary(c.summaryAppointments);
  const { cancelledCount, reservedMinutes } = agendaDayOccupancy(calendarDateKey(anchor), c.dayAvailability.rows);
  const slots = c.dayAvailability.status === 'ready' && c.agendaSettings
    ? availableAgendaSlots(calendarDateKey(anchor), Number(c.agendaSettings.slotDuration), c.agendaSettings, c.dayAvailability.rows) : [];
  const selectMode = view => { c.setSelectedDate(null); c.setPeriodDate(anchor); c.setFilterView(view); };
  const selectDay = day => { c.setSelectedDate(day); c.setCalendarMonth(startOfMonth(day)); };
  const navigatePeriod = direction => {
    const date = mode === 'month' ? addMonths(anchor, direction) : addDays(anchor, direction * (mode === 'week' ? 7 : 1));
    if (mode === 'today') selectDay(date); else c.setPeriodDate(date);
    c.setCalendarMonth(startOfMonth(date));
  };
  const shown = c.filteredAppointments.filter(item => statusFilter === 'all' || item.status === statusFilter);
  const groups = {};
  for (const item of shown) { const key = c.appointmentDateKey(item.appointment_time); (groups[key] ||= []).push(item); }
  const weekStart = startOfWeek(anchor, { locale: ptBR });
  const week = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthStart = startOfMonth(anchor), gridStart = startOfWeek(monthStart, { locale: ptBR });
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const title = mode === 'week' ? `${format(weekStart, 'dd/MM')} – ${format(addDays(weekStart, 6), 'dd/MM/yyyy')}` : mode === 'month' ? format(anchor, 'MMMM yyyy', { locale: ptBR }) : mode === 'all' ? 'Próximos agendamentos' : format(anchor, "dd 'de' MMMM", { locale: ptBR });
  const renderCard = item => <AgendaAppointmentCard key={item.id} appointment={item} status={c.getStatusInfo(item.status)} type={c.getTypeInfo(item.appointment_type)} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onRegister={() => onRegister(item)} onPatient={() => onPatient(item)} onAnamnesis={() => onAnamnesis(item)} onCharge={() => onCharge(item)} />;
  const loadState = c.loading ? <div role="status" className="agenda-loading"><span className="sr-only">Carregando agendamentos…</span>{[1, 2, 3].map(key => <div key={key} className="agenda-skeleton" />)}</div> : null;
  return <section className="agenda-workspace">
    <header className="agenda-heading agenda-enter"><div><h2 className="font-heading text-2xl font-bold uppercase tracking-wide text-primary md:text-3xl">Agenda de Consultas</h2><p className="mt-1 text-sm text-muted-foreground md:text-base">Visualize e gerencie todos os seus agendamentos.</p></div><div className="agenda-heading-actions"><Button variant="outline" onClick={onSettings}><Settings className="h-4 w-4" aria-hidden="true" /><span>Configurar agenda</span></Button><Button variant="outline" onClick={onExport} disabled={c.exporting}><FileDown className="h-4 w-4" aria-hidden="true" /><span>Exportar PDF</span></Button><Button onClick={() => onNew()} disabled={c.referencesLoading}><Plus className="h-4 w-4" aria-hidden="true" /><span>Novo Agendamento</span></Button></div></header>
    <div className="agenda-summary agenda-enter" style={{ '--agenda-delay': '70ms' }} aria-label="Resumo de agendamentos">
      {[['today', 'Hoje', counts.today], ['week', 'Esta semana', counts.week], ['month', 'Este mês', counts.month]].map(([view, label, count]) => <button key={view} type="button" className={`agenda-summary-item agenda-summary--${view}`} onClick={() => { c.setPeriodDate(agendaToday()); c.setSelectedDate(null); c.setFilterView(view); }}><span>{label}</span><strong>{c.summaryReady ? count : '—'}</strong><small>agendamentos</small></button>)}
    </div>
    {c.summaryError && <SectionError text="O resumo não pôde ser atualizado. As contagens não estão disponíveis." onRetry={c.reloadOverview} />}
    <div className="agenda-toolbar agenda-enter" style={{ '--agenda-delay': '140ms' }}>
      <div className="agenda-views" role="group" aria-label="Visualização da agenda">{views.map(([view, label]) => <Button key={view} variant={mode === view ? 'default' : 'ghost'} aria-pressed={mode === view} onClick={() => selectMode(view)}>{label}</Button>)}</div>
      <div className="agenda-period"><Button size="icon" variant="ghost" aria-label="Período anterior" onClick={() => navigatePeriod(-1)} disabled={mode === 'all'}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button><p aria-live="polite" className="capitalize">{title}</p><Button size="icon" variant="ghost" aria-label="Próximo período" onClick={() => navigatePeriod(1)} disabled={mode === 'all'}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button><Button variant="outline" onClick={() => selectDay(agendaToday())}>Hoje</Button></div>
    </div>
    <div className="agenda-layout agenda-enter" style={{ '--agenda-delay': '210ms' }}>
      <section className="agenda-panel min-w-0" aria-label="Agendamentos">
        <div className="agenda-search"><label htmlFor="agenda-search" className="sr-only">Buscar agendamento pelo paciente</label><Search className="h-4 w-4" aria-hidden="true" /><Input id="agenda-search" placeholder="Buscar paciente..." value={c.patientSearch} onChange={event => c.setPatientSearch(event.target.value)} /><label htmlFor="agenda-status-filter" className="sr-only">Filtrar status</label><select id="agenda-status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todos os status</option>{['scheduled', 'awaiting_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show'].map(status => <option key={status} value={status}>{c.getStatusInfo(status).label}</option>)}</select></div>
        <div className="agenda-day-strip" aria-label="Escolher dia da semana">{week.map(day => <button key={calendarDateKey(day)} type="button" aria-pressed={mode === 'today' && calendarDateKey(anchor) === calendarDateKey(day)} aria-label={format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })} onClick={() => selectDay(day)}><span>{format(day, 'EEEE', { locale: ptBR }).slice(0, 3)}</span><strong>{format(day, 'd')}</strong><span className={isAgendaTodayDate(day) ? 'agenda-today-dot' : ''} aria-hidden="true" /></button>)}</div>
        {(c.patientSearch || statusFilter !== 'all') && <Button variant="ghost" className="mt-2" onClick={() => { c.setPatientSearch(''); setStatusFilter('all'); }}>Limpar filtros</Button>}
        {c.loadError ? <SectionError text="Não foi possível atualizar os agendamentos. Tente novamente antes de confiar nesta lista." onRetry={c.loadData} /> : loadState || <>
          {mode === 'month' && <div className="agenda-month" aria-label="Calendário mensal">{['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(label => <span key={label} className="agenda-month-label">{label}</span>)}{monthDays.map(day => { const key = calendarDateKey(day), dayRows = groups[key] || []; return <button key={key} type="button" disabled={day < monthStart || day > endOfMonth(anchor)} className={isAgendaTodayDate(day) ? 'agenda-month-today' : ''} onClick={() => selectDay(day)} aria-label={`${format(day, 'dd/MM/yyyy')}, ${dayRows.length} agendamentos`}><strong>{format(day, 'd')}</strong><span>{dayRows.length ? `${dayRows.length} agend.` : '—'}</span></button>; })}</div>}
          <div className={mode === 'week' ? 'agenda-week-groups' : 'agenda-list-groups'}>{(mode === 'week' ? week.map(day => [calendarDateKey(day), groups[calendarDateKey(day)] || []]) : Object.entries(groups)).map(([key, rows]) => <section key={key} className="agenda-day-group"><h3>{c.formatAppointmentDate(key)} <span>{rows.length}</span></h3>{rows.length ? <div className="agenda-card-list">{rows.map(renderCard)}</div> : <div className="agenda-day-empty">Nenhum agendamento<Button variant="ghost" onClick={() => onNew(key)}>Agendar neste dia</Button></div>}</section>)}</div>
          {!shown.length && mode !== 'week' && <div className="agenda-empty"><CalendarDays className="h-10 w-10 text-primary/60" aria-hidden="true" /><h3>Nenhum agendamento encontrado</h3><p>{c.patientSearch || statusFilter !== 'all' ? 'Experimente outro nome ou limpe os filtros.' : 'Escolha outra data ou adicione um agendamento.'}</p><Button variant="outline" onClick={() => onNew()}>Novo agendamento</Button></div>}
        </>}
      </section>
      <aside className="agenda-sidebar">
        <section className="agenda-panel"><h3 className="font-semibold text-primary">Calendário</h3>{c.calendarError ? <SectionError text="As contagens do calendário não estão disponíveis." onRetry={c.reloadOverview} /> : <Calendar mode="single" locale={ptBR} month={c.calendarMonth} onMonthChange={c.setCalendarMonth} selected={c.selectedDate} onSelect={day => day && selectDay(day)} modifiers={{ booked: day => !!c.appointmentsByDay[calendarDateKey(day)] }} labels={{ labelPrevious: () => 'Mês anterior', labelNext: () => 'Próximo mês' }} modifiersClassNames={{ booked: 'agenda-calendar-booked' }} /> }<p className="text-xs text-muted-foreground">Dias destacados têm agendamentos; não representam capacidade disponível.</p></section>
        <section className="agenda-panel agenda-day-context"><h3 className="font-semibold">Jornada do consultório</h3>{c.referenceErrors.settings || !c.agendaSettings ? <SectionError text="Não foi possível conferir a configuração." onRetry={c.reloadReferences} /> : <><p className="mt-3 text-primary"><strong>{c.agendaSettings.startTime} – {c.agendaSettings.endTime}</strong></p><p className="mt-1 text-sm text-muted-foreground">Duração padrão: {c.agendaSettings.slotDuration} minutos</p><p className="mt-3 text-xs text-muted-foreground">Os horários sugeridos respeitam a jornada e a duração. A reserva é confirmada ao salvar.</p></>}
          <h4 className="mt-5 text-sm font-medium">{format(anchor, 'dd/MM/yyyy')} · contexto do dia</h4>
          {c.dayAvailability.status === 'error' ? <SectionError text="Não foi possível conferir as reservas deste dia." onRetry={c.dayAvailability.retry} /> : c.dayAvailability.status !== 'ready' ? <p role="status" className="mt-2 text-xs text-muted-foreground">Conferindo os horários…</p> : <><p className="mt-2 text-xs text-muted-foreground">{reservedMinutes} minutos em reservas · {cancelledCount} cancelado(s)</p>{slots.length > 0 && <p className="mt-2 text-xs text-primary">Próximas sugestões: {slots.slice(0, 3).join(' · ')}</p>}<p className="mt-2 text-xs text-muted-foreground">Reservas concluídas e faltas mantêm seu intervalo histórico. Canceladas não ocupam horário.</p></>}
          <Button variant="outline" className="mt-4 w-full" onClick={onSettings}>Editar jornada</Button></section>
      </aside>
    </div>
  </section>;
}
