import { Clock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { localTimeInZone } from '@/lib/utils/date';
import { agendaEndTime } from '@/lib/agenda/availability';
import { appointmentCharge } from '@/lib/agenda/navigation';
import { isTerminalAppointment } from '@/lib/agenda/appointment-rules';
import { formatCurrency } from '@/lib/utils';

export default function AgendaAppointmentCard({ appointment, status, type, onEdit, onDelete, onRegister, onPatient, onAnamnesis, onCharge, onNotices, onReturn, onCalendar, returnLoading }) {
  const name = appointment.patient?.name || appointment.unregistered_patient_name || 'Paciente não identificado';
  const charge = appointmentCharge(appointment), terminal = isTerminalAppointment(appointment.status);
  return <div data-appointment-id={appointment.id} className="agenda-appointment bg-muted/30">
    <div className="agenda-appointment-time"><Clock className="h-4 w-4" aria-hidden="true" /><time dateTime={appointment.appointment_time}>{localTimeInZone(appointment.appointment_time)}</time><span>{agendaEndTime(appointment.appointment_time, appointment.duration)}</span></div>
    <div className="agenda-appointment-info">
      <button type="button" className="agenda-patient-name" onClick={onEdit}>{name}</button>
      <div className="agenda-appointment-meta"><span className={`agenda-status agenda-status--${appointment.status || 'scheduled'}`}>{status.label}</span><span>{type.label}</span>{!appointment.patient_id && <span className="text-amber-800 dark:text-amber-200">Sem cadastro</span>}</div>
      {charge && <Button type="button" variant="ghost" className="agenda-charge" onClick={onCharge}>{formatCurrency(charge.amount)} · {({ paid: 'Pago', pending: 'Pendente', overdue: 'Vencido', refunded: 'Estornado' })[charge.status] || 'Cobrança'}</Button>}
      {appointment.notes && <p className="agenda-card-notes">{appointment.notes}</p>}
    </div>
    <div className="agenda-appointment-actions">
      <Button variant="outline" title="Editar agendamento" onClick={onEdit} className="agenda-detail-button">{terminal ? 'Ver detalhes' : 'Abrir agendamento'}</Button>
      {!appointment.patient_id && !terminal && <Button variant="ghost" title="Cadastrar Paciente" className="agenda-register-button" onClick={onRegister}>Completar cadastro</Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl" aria-label={`Mais ações de ${name}`}><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
          <DropdownMenuItem className="min-h-11" onSelect={onEdit}>{terminal ? 'Consultar agendamento' : 'Editar agendamento'}</DropdownMenuItem>
          {appointment.patient_id && <><DropdownMenuItem className="min-h-11" onSelect={onPatient}>Ver detalhes do paciente</DropdownMenuItem><DropdownMenuItem className="min-h-11" onSelect={onAnamnesis}>Abrir formulário de anamnese</DropdownMenuItem></>}
          {!appointment.patient_id && !terminal && <DropdownMenuItem className="min-h-11" onSelect={onRegister}>Completar cadastro</DropdownMenuItem>}
          {charge && <DropdownMenuItem className="min-h-11" onSelect={onCharge}>Abrir cobrança no Financeiro</DropdownMenuItem>}
          <DropdownMenuItem className="min-h-11" onSelect={onNotices}>Avisos da consulta</DropdownMenuItem>
          {appointment.patient_id && appointment.status === 'completed' && onReturn && <DropdownMenuItem className="min-h-11" disabled={returnLoading} onSelect={onReturn}>Agendar retorno</DropdownMenuItem>}
          {!terminal && onCalendar && <DropdownMenuItem className="min-h-11" onSelect={onCalendar}>Baixar para calendário (.ics)</DropdownMenuItem>}
          <DropdownMenuSeparator /><DropdownMenuItem title="Excluir agendamento" className="min-h-11 text-destructive focus:text-destructive" onSelect={onDelete}>Excluir agendamento</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>;
}
