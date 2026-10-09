import { matchPath } from 'react-router-dom';

const item = (label, to) => ({ label, to });
const nutritionist = [item('Início', '/nutritionist')];
const patient = [item('Início', '/patient')];
const protocols = [...nutritionist, item('Protocolos', '/nutritionist/templates')];
const patientPages = {
  hub: ['Prontuário', null], anamnese: ['Anamneses', 'clinical'],
  anthropometry: ['Antropometria', 'body'], 'meal-plan': ['Plano alimentar', 'nutrition'],
  'energy-expenditure': ['Cálculos nutricionais', 'nutrition'], 'lab-results': ['Exames', 'clinical'],
  goals: ['Metas', 'adherence'], 'food-diary': ['Diário alimentar', 'adherence'],
  achievements: ['Conquistas', 'adherence'], photos: ['Fotos de progresso', 'body'],
};
const hubTabs = { overview: 'Visão geral', clinical: 'Clínico', body: 'Corpo', nutrition: 'Nutrição', adherence: 'Adesão', checkins: 'Check-ins' };
const templateTypes = { diet: 'dieta', meal: 'refeição', message: 'mensagem', checkin: 'check-in', anamnesis: 'anamnese' };
const patientBase = (params, tab) => [
  ...nutritionist, item('Pacientes', '/nutritionist/patients'),
  item('Prontuário', `/nutritionist/patients/${params.patientId}/hub`),
  ...(tab ? [item(hubTabs[tab], `/nutritionist/patients/${params.patientId}/hub?tab=${tab}`)] : []),
];
const simple = (base, path, label) => ({ path, build: () => [...base, item(label, path)] });

export const portalBreadcrumbRoutes = [
  { path: '/nutritionist', build: () => nutritionist },
  ...Object.entries({ profile: 'Meu perfil', notifications: 'Notificações', calculations: 'Informações de cálculo', patients: 'Pacientes', alerts: 'Alertas', chat: 'Mensagens', financial: 'Financeiro', agenda: 'Agenda', templates: 'Protocolos', foods: 'Banco de alimentos', 'food-bank': 'Protocolos', 'message-templates': 'Protocolos', checkins: 'Check-ins' }).map(([path,label]) => simple(nutritionist, `/nutritionist/${path}`, label)),
  { path: '/nutritionist/chat/:patientId', build: p => [...nutritionist, item('Mensagens', '/nutritionist/chat'), item('Conversa', `/nutritionist/chat/${p.patientId}`)] },
  ...Object.entries(patientPages).map(([path,[label,tab]]) => ({ path: `/nutritionist/patients/:patientId/${path}`, build: (p, search) => {
    if (path === 'hub') {
      const currentTab = new URLSearchParams(search).get('tab');
      const base = patientBase(p);
      return hubTabs[currentTab] ? [...base, item(hubTabs[currentTab], `/nutritionist/patients/${p.patientId}/hub?tab=${currentTab}`)] : base;
    }
    return [...patientBase(p,tab), item(label, `/nutritionist/patients/${p.patientId}/${path}`)];
  } })),
  { path: '/nutritionist/patients/:patientId/anamnese/new', build: p => [...patientBase(p,'clinical'), item('Anamneses', `/nutritionist/patients/${p.patientId}/anamnese`), item('Nova anamnese')] },
  { path: '/nutritionist/patients/:patientId/anamnese/:anamnesisId/edit', build: p => [...patientBase(p,'clinical'), item('Anamneses', `/nutritionist/patients/${p.patientId}/anamnese`), item('Editar anamnese')] },
  { path: '/nutritionist/patients/:patientId/meal-plan/:planId/summary', build: p => [...patientBase(p,'nutrition'), item('Plano alimentar', `/nutritionist/patients/${p.patientId}/meal-plan`), item('Resumo nutricional')] },
  { path: '/nutritionist/templates/forms/new', build: () => [...protocols, item('Nova anamnese')] },
  { path: '/nutritionist/templates/forms/:templateId/edit', build: () => [...protocols, item('Editar anamnese')] },
  { path: '/nutritionist/templates/checkins/new', build: () => [...protocols, item('Novo check-in')] },
  { path: '/nutritionist/templates/checkins/:templateId/edit', build: () => [...protocols, item('Editar check-in')] },
  { path: '/nutritionist/templates/new/:type', build: p => [...protocols, item(`Novo modelo${templateTypes[p.type] ? ` de ${templateTypes[p.type]}` : ''}`)] },
  { path: '/nutritionist/templates/edit/:type/:id', build: p => [...protocols, item(`Editar modelo${templateTypes[p.type] ? ` de ${templateTypes[p.type]}` : ''}`)] },
  { path: '/patient', build: () => patient },
  ...Object.entries({ invites: 'Convites', diario: 'Plano e diário alimentar', progresso: 'Progresso', chat: 'Mensagens', perfil: 'Meu perfil', conquistas: 'Conquistas', 'registros-clinicos': 'Registros clínicos' }).map(([path,label]) => simple(patient, `/patient/${path}`, label)),
  { path: '/patient/editar-perfil', build: () => [...patient, item('Meu perfil', '/patient/perfil'), item('Editar perfil')] },
  { path: '/patient/add-food/:mealId?', build: p => [...patient, item('Plano e diário alimentar', '/patient/diario'), item(p.mealId ? 'Editar refeição' : 'Registrar refeição')] },
  { path: '/patient/add-meal', build: () => [...patient, item('Plano e diário alimentar', '/patient/diario'), item('Registrar refeição')] },
  { path: '/patient/checkin/:sessionId', build: () => [...patient, item('Responder check-in')] },
];

export function getPortalBreadcrumbs(pathname, search = '') {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const route of portalBreadcrumbRoutes) {
    const match = matchPath({ path: route.path, end: true }, path);
    if (match) return route.build(match.params, search).map(crumb => ({ ...crumb }));
  }
  return [];
}
