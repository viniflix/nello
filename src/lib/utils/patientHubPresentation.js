const appointmentLabels = {
  scheduled: 'Agendada', confirmed: 'Confirmada', awaiting_confirmation: 'Aguardando confirmação',
  completed: 'Realizada', cancelled: 'Cancelada', canceled: 'Cancelada', no_show: 'Não compareceu',
};
const checkinLabels = {
  pending: 'Aguardando resposta', sent: 'Enviado', completed: 'Respondido', expired: 'Expirado',
  cancelled: 'Cancelado', canceled: 'Cancelado', scheduled: 'Agendado',
};
const appointmentTypes = {
  first_appointment: 'Primeira consulta', return: 'Retorno', evaluation: 'Avaliação',
  online: 'Online', in_person: 'Presencial',
};
export const appointmentStatusLabel = status => appointmentLabels[status] || 'Status não informado';
export const checkinStatusLabel = status => checkinLabels[status] || 'Status não informado';
export const appointmentTypeLabel = type => appointmentTypes[type] || 'Consulta';
const patientCategories = { adult: 'Adulto', child: 'Criança', adolescent: 'Adolescente', elderly: 'Idoso', pregnant: 'Gestante', pregnancy: 'Gestante', lactating: 'Lactante', athlete: 'Atleta' };
export const patientCategoryLabel = category => patientCategories[category] || category;
