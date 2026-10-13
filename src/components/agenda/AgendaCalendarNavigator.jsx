import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { calendarDateKey } from '@/lib/agenda/availability';
import { civilDateInZone } from '@/lib/utils/date';

export const agendaStatusLabels = {
  scheduled: 'Agendada', awaiting_confirmation: 'Aguardando', confirmed: 'Confirmada',
  completed: 'Realizada', cancelled: 'Cancelada', no_show: 'Faltou',
};
export function AgendaStatusLegend() {
  return <div className="agenda-status-legend" aria-label="Cores dos status">{Object.entries(agendaStatusLabels).map(([status, label]) => <span key={status}><i className={`agenda-status-dot agenda-color--${status}`} aria-hidden="true" />{label}</span>)}</div>;
}
export default function AgendaCalendarNavigator({ month, onMonthChange, selected, onSelect, appointments, error, loading, onRetry }) {
  const byDate = useMemo(() => {
    const map = {};
    for (const row of error || loading ? [] : appointments || []) {
      const key = civilDateInZone(row.appointment_time);
      (map[key] ||= []).push(row.status);
    }
    return map;
  }, [appointments, error, loading]);
  const components = useMemo(() => ({
    IconLeft: () => <ChevronLeft className="h-4 w-4" aria-hidden="true" />,
    IconRight: () => <ChevronRight className="h-4 w-4" aria-hidden="true" />,
    DayContent: ({ date }) => {
      const statuses = byDate[calendarDateKey(date)] || [];
      const unique = [...new Set(statuses)];
      return <span className="agenda-nav-day"><span>{format(date, 'd')}</span><span className="agenda-nav-signals" aria-hidden="true">{unique.slice(0, 3).map(status => <i key={status} className={`agenda-status-dot agenda-color--${status}`} />)}{unique.length > 3 && <b>+</b>}</span>{statuses.length > 0 && <span className="sr-only">, {statuses.length} registros: {unique.map(status => agendaStatusLabels[status] || status).join(', ')}</span>}</span>;
    },
  }), [byDate]);
  return <aside className="agenda-calendar-navigator" aria-label="Calendário de navegação">
    <div className="agenda-navigator-title"><span>Seu calendário</span><small>Visão do mês</small></div>
    <Calendar mode="single" locale={ptBR} month={month} onMonthChange={onMonthChange} selected={selected} onDayClick={day => onSelect(day)} components={components} classNames={{ months: 'rdp-months', month: 'rdp-month', table: 'rdp-table', head_row: 'rdp-head_row', head_cell: 'rdp-head_cell', row: 'rdp-row', cell: 'rdp-cell', day: 'rdp-day rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary' }} labels={{ labelPrevious: () => 'Mês anterior', labelNext: () => 'Próximo mês' }} />
    {error ? <div role="alert" className="agenda-calendar-error">Não foi possível atualizar os sinais.<button type="button" onClick={onRetry}>Tentar novamente</button></div> : loading ? <p role="status" className="agenda-navigator-caption">Atualizando calendário…</p> : <p className="agenda-navigator-caption">Selecione um dia. Os pontos mostram os status dos registros, incluindo cancelamentos.</p>}
    <AgendaStatusLegend />
  </aside>;
}
