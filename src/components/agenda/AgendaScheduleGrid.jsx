import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GripVertical } from 'lucide-react';
import { calendarDateKey, isAgendaTodayDate } from '@/lib/agenda/availability';
import { isTerminalAppointment } from '@/lib/agenda/appointment-rules';
import { appointmentDayInterval, appointmentClock, appointmentLanes, minuteTime, scheduleBounds } from '@/lib/agenda/schedule-layout';

/** Drag opens a reviewed draft. It never mutates reservations or financial records. */
export default function AgendaScheduleGrid({ days, appointments, settings, onNew, onEdit, onMove, getStatusInfo }) {
  const [draggedId, setDraggedId] = useState(null), [dropTarget, setDropTarget] = useState(null);
  const dates = days.map(calendarDateKey), bounds = scheduleBounds(appointments, settings, dates);
  const minutes = Array.from({ length: Math.ceil((bounds.end - bounds.start) / 30) }, (_, i) => bounds.start + i * 30);
  const movable = appointments.filter(item => !isTerminalAppointment(item.status));
  const drop = (event, date, minute) => {
    event.preventDefault();
    const item = movable.find(row => String(row.id) === String(draggedId));
    setDraggedId(null); setDropTarget(null);
    if (item) onMove?.(item, date, minuteTime(minute));
  };
  return <div className="agenda-schedule" style={{ '--agenda-columns': days.length }}>
    <div className="agenda-schedule-head"><span className="agenda-zone">Fortaleza</span>{days.map(day => <button key={calendarDateKey(day)} type="button" className={isAgendaTodayDate(day) ? 'is-today' : ''} onClick={() => onNew(calendarDateKey(day))} aria-label={`Agendar em ${format(day, 'dd/MM/yyyy')}`}><span>{format(day, 'EEE', { locale: ptBR })}</span><strong>{format(day, 'd')}</strong></button>)}</div>
    <div className="agenda-schedule-scroll" role="region" aria-label="Grade de horários; selecione um intervalo para agendar" tabIndex={0}>
      <div className="agenda-schedule-body">
        <div className="agenda-hours" aria-hidden="true">{minutes.map(minute => <span key={minute}>{minute % 60 === 0 ? minuteTime(minute) : ''}</span>)}</div>
        {dates.map(date => {
          const rows = appointments.map(item => ({ item, interval: appointmentDayInterval(item, date) })).filter(row => row.interval);
          const lanes = appointmentLanes(rows);
          return <div key={date} className="agenda-schedule-day" style={{ height: minutes.length * 48 }}>
            {minutes.map(minute => <button key={minute} type="button" className={`agenda-time-slot ${dropTarget === `${date}:${minute}` ? 'is-drop-target' : ''}`} aria-label={`Agendar ${date} às ${minuteTime(minute)}`} onClick={() => onNew(date, minuteTime(minute))}
              onDragOver={event => { if (draggedId !== null) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(`${date}:${minute}`); } }} onDrop={event => drop(event, date, minute)}><span aria-hidden="true">{minuteTime(minute)} · +</span></button>)}
            {rows.map(({ item, interval }, index) => {
              // Historical overlaps stay independently accessible in adjacent lanes.
              const { lane, count } = lanes.get(item.id), width = 100 / count;
              const name = item.patient?.name || item.unregistered_patient_name || 'Paciente';
              const terminal = isTerminalAppointment(item.status);
              return <button key={item.id} type="button" data-schedule-appointment={item.id} className={`agenda-schedule-booking agenda-schedule--${item.status} agenda-color--${item.status} agenda-grid-enter ${String(draggedId) === String(item.id) ? 'is-dragging' : ''}`} style={{ top: (interval.start - bounds.start) / 30 * 48 + 2, height: Math.max(38, (interval.end - interval.start) / 30 * 48 - 4), left: `calc(${lane * width}% + 3px)`, width: `calc(${width}% - 6px)`, '--agenda-row-index': Math.min(index, 5) }}
                onClick={() => onEdit(item)} draggable={!terminal && Boolean(onMove)} onDragStart={event => { if (terminal) { event.preventDefault(); return; } setDraggedId(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(item.id)); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
                title={`${appointmentClock(item)} · ${name} · ${getStatusInfo(item.status).label}`} aria-label={`${appointmentClock(item)} · ${name} · ${getStatusInfo(item.status).label}. ${terminal ? 'Ver detalhes' : 'Editar ou reagendar'}`}>
                <span className="agenda-grid-time">{appointmentClock(item)}{!terminal && <GripVertical aria-hidden="true" size={12} />}</span><strong>{name}</strong><span className="agenda-grid-status">{getStatusInfo(item.status).label}</span>
              </button>;
            })}
          </div>;
        })}
      </div>
    </div>
    <p className="agenda-grid-hint">Clique em um horário para reservar. Para reagendar, arraste a consulta ou abra seus detalhes. Nada muda antes de salvar.</p>
  </div>;
}
