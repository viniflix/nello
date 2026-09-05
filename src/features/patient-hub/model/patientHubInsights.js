const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysBetween = (from, to) => {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
};

const createInsight = ({ id, priority, tone, title, description, actionLabel, action, reasons }) => ({
  id,
  priority,
  tone,
  title,
  description,
  actionLabel,
  action,
  reasons: reasons.filter(Boolean),
});

/**
 * Motor explicável de priorização do Hub.
 *
 * O resultado é sempre derivado de dados estruturados do prontuário. Nenhum
 * diagnóstico ou conduta é inferido. O profissional recebe a evidência usada
 * na priorização e mantém a decisão clínica final.
 */
export const buildPatientHubInsights = ({
  profileRequirements = [],
  operationalContext = {},
  latestMetrics = {},
  modulesStatus = {},
  adherence = null,
  now = new Date(),
} = {}) => {
  const candidates = [];
  const {
    activePlan,
    draftPlan,
    planStatus,
    nextAppointment,
    latestCheckin,
    latestClinicalRecord,
  } = operationalContext || {};

  if (operationalContext?.partialErrors?.length || planStatus === 'unknown') {
    const unavailable = createInsight({
      id: 'incomplete-data', priority: 110, tone: 'warning',
      title: 'Atualizar os dados do acompanhamento',
      description: 'Parte dos registros não pôde ser carregada. Atualize os dados para conferir as próximas ações.',
      actionLabel: 'Tentar novamente', action: { type: 'refresh' },
      reasons: (operationalContext.partialErrors || ['planos alimentares']).map((source) => `Não foi possível carregar: ${source}`),
    });
    return { primary: unavailable, signals: [unavailable], generatedAt: now.toISOString(), methodology: 'A recomendação depende dos registros disponíveis no prontuário.' };
  }

  if (profileRequirements.length > 0) {
    candidates.push(createInsight({
      id: 'complete-profile',
      priority: 100,
      tone: 'warning',
      title: 'Completar dados essenciais do paciente',
      description: 'Alguns dados obrigatórios do perfil ainda estão pendentes.',
      actionLabel: 'Completar perfil',
      action: { type: 'edit-profile' },
      reasons: profileRequirements.map((requirement) => `Campo pendente: ${requirement}`),
    }));
  }

  if (draftPlan) {
    candidates.push(createInsight({
      id: 'resume-draft-plan',
      priority: 90,
      tone: 'attention',
      title: 'Continuar o plano alimentar em rascunho',
      description: 'Há um plano em rascunho pronto para continuar.',
      actionLabel: 'Continuar plano',
      action: { type: 'meal-plan', mode: 'quick' },
      reasons: [
        draftPlan.name ? `Rascunho: ${draftPlan.name}` : 'Há um rascunho salvo',
        draftPlan.updated_at ? `Última alteração em ${new Date(draftPlan.updated_at).toLocaleDateString('pt-BR')}` : null,
      ],
    }));
  } else if (!activePlan) {
    candidates.push(createInsight({
      id: 'create-meal-plan',
      priority: 85,
      tone: 'attention',
      title: 'Iniciar o plano alimentar',
      description: 'Ainda não existe um plano ativo para este acompanhamento.',
      actionLabel: 'Iniciar plano',
      action: { type: 'meal-plan', mode: 'quick' },
      reasons: ['Nenhum plano alimentar ativo ou rascunho foi encontrado'],
    }));
  } else if (planStatus === 'review') {
    candidates.push(createInsight({
      id: 'review-meal-plan',
      priority: 80,
      tone: 'attention',
      title: 'Revisar o plano alimentar',
      description: 'O plano ativo ainda está com status “Em revisão”.',
      actionLabel: 'Revisar plano',
      action: { type: 'meal-plan', mode: 'quick' },
      reasons: [activePlan.name ? `Plano: ${activePlan.name}` : null, 'Status da prescrição: em revisão'],
    }));
  }

  const nextAppointmentAt = nextAppointment?.start_time || nextAppointment?.appointment_time;
  const daysUntilAppointment = daysBetween(now, nextAppointmentAt);
  const daysSinceMeasurement = daysBetween(latestMetrics?.last_measurement, now);
  if (daysUntilAppointment !== null && daysUntilAppointment >= 0 && daysUntilAppointment <= 7
      && (daysSinceMeasurement === null || daysSinceMeasurement > 30)) {
    candidates.push(createInsight({
      id: 'update-measurement-before-appointment',
      priority: 75,
      tone: 'attention',
      title: 'Atualizar a avaliação corporal antes da consulta',
      description: 'A consulta está próxima e não há uma medição recente para apoiar a comparação.',
      actionLabel: 'Atualizar medidas',
      action: { type: 'tab', tab: 'body' },
      reasons: [
        `Consulta em ${daysUntilAppointment === 0 ? 'menos de um dia' : `${daysUntilAppointment} dia${daysUntilAppointment === 1 ? '' : 's'}`}`,
        daysSinceMeasurement === null ? 'Nenhuma avaliação corporal encontrada' : `Última avaliação há ${daysSinceMeasurement} dias`,
      ],
    }));
  }

  if (adherence?.totalMeals > 0 && adherence.adherencePercentage < 60) {
    candidates.push(createInsight({
      id: 'review-low-adherence',
      priority: 70,
      tone: 'warning',
      title: 'Revisar a adesão recente',
      description: 'Os registros dos últimos sete dias indicam baixa regularidade no diário alimentar.',
      actionLabel: 'Ver adesão',
      action: { type: 'tab', tab: 'adherence' },
      reasons: [
        `Adesão registrada: ${adherence.adherencePercentage}%`,
        `${adherence.daysWithRecords || 0} de ${adherence.totalDays || 7} dias com registros`,
      ],
    }));
  }

  if (latestCheckin?.status === 'completed') {
    const checkinAge = daysBetween(latestCheckin.completed_at, now);
    if (checkinAge !== null && checkinAge >= 0 && checkinAge <= 7) {
      candidates.push(createInsight({
        id: 'review-checkin',
        priority: 65,
        tone: 'info',
        title: 'Revisar o check-in mais recente',
        description: 'Há um check-in recente aguardando revisão.',
        actionLabel: 'Abrir check-in',
        action: { type: 'tab', tab: 'checkins' },
        reasons: [
          `Respondido há ${checkinAge} dia${checkinAge === 1 ? '' : 's'}`,
          latestCheckin.adherence_percentage != null ? `Adesão informada: ${Math.round(Number(latestCheckin.adherence_percentage))}%` : null,
        ],
      }));
    }
  }

  if (nextAppointmentAt) {
    candidates.push(createInsight({
      id: 'prepare-next-appointment',
      priority: 40,
      tone: 'info',
      title: 'Preparar a próxima consulta',
      description: 'Consulte os registros recentes antes do atendimento.',
      actionLabel: 'Abrir clínico',
      action: { type: 'tab', tab: 'clinical' },
      reasons: [
        `Consulta em ${new Date(nextAppointmentAt).toLocaleDateString('pt-BR')}`,
        latestClinicalRecord?.recorded_at
          ? `Último registro clínico em ${new Date(latestClinicalRecord.recorded_at).toLocaleDateString('pt-BR')}`
          : 'Nenhum registro clínico recente encontrado',
      ],
    }));
  }

  if (candidates.length === 0) {
    candidates.push(createInsight({
      id: 'review-overview',
      priority: 10,
      tone: 'success',
      title: 'Acompanhamento em dia',
      description: 'Nenhuma pendência prioritária foi identificada com os dados disponíveis.',
      actionLabel: 'Ver histórico',
      action: { type: 'tab', tab: 'clinical' },
      reasons: [
        modulesStatus?.anamnese === 'completed' ? 'Anamnese concluída' : null,
        activePlan ? 'Plano alimentar ativo' : null,
        'Análise baseada nos registros disponíveis no prontuário',
      ],
    }));
  }

  const ordered = candidates.sort((a, b) => b.priority - a.priority);
  return {
    primary: ordered[0],
    signals: ordered.slice(0, 3),
    generatedAt: now.toISOString(),
    methodology: 'Baseada nos registros disponíveis no prontuário.',
  };
};
