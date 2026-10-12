import { availableAgendaSlots, validateAgendaSettings } from '@/lib/agenda/availability';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export default function AgendaAvailabilityOptions({ date, duration, settings, availability, appointmentId, onChoose, onConfigure }) {
  const [limit, setLimit] = useState(6);
  useEffect(() => setLimit(6), [date, duration]);
  const valid = settings && !validateAgendaSettings(settings).length;
  const slots = date && valid && availability.status === 'ready' ? availableAgendaSlots(date, Number(duration), settings, availability.rows, appointmentId) : [];
  return <section aria-label="Horários disponíveis" className="rounded-xl bg-primary/5 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Horários para {duration} minutos</p>{onConfigure && <Button type="button" variant="ghost" className="min-h-11 text-xs" onClick={onConfigure}>Configurar agenda</Button>}</div>
    {!valid ? <p className="text-xs text-muted-foreground">A jornada não foi validada. Configure seus horários para receber sugestões.</p>
      : availability.status === 'loading' ? <p role="status" className="text-xs text-muted-foreground">Conferindo ocupação e jornada…</p>
        : availability.status === 'error' ? <div role="alert" className="text-xs text-muted-foreground">Não foi possível conferir a disponibilidade.<Button type="button" variant="outline" className="mt-2 min-h-11" onClick={availability.retry}>Tentar novamente</Button></div>
          : <><p className="mb-2 text-xs text-muted-foreground">Jornada {settings.startTime}–{settings.endTime}. A reserva será confirmada ao salvar.</p>
            {slots.length ? <div className="flex flex-wrap gap-2">{slots.slice(0, limit).map(time => <Button type="button" key={time} variant="outline" className="min-h-11" onClick={() => onChoose(time)}>{time}</Button>)}{slots.length > limit && <Button type="button" variant="ghost" className="min-h-11" onClick={() => setLimit(value => value + 6)}>Mais horários</Button>}</div>
              : <p className="text-xs text-muted-foreground">Nenhum horário disponível para esta duração na jornada deste dia. Você pode ajustar a duração ou escolher outro dia.</p>}</>}
  </section>;
}
