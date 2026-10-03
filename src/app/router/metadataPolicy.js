import { publicInformationPaths } from '../../features/privacy/publicInformationPaths.js';
export const PUBLIC_ORIGIN = 'https://nellonutri.com.br';
const publicPages = {
  '/': ['Nello — Consultório nutricional', 'Organize pacientes, avaliações, planos alimentares e acompanhamento nutricional. Conheça o Nello e encontre ajuda para acessar.'],
  '/login': ['Entrar — Nello', 'Acesse sua conta Nello.'],
  '/register': ['Criar conta — Nello', 'Conheça os papéis de nutricionista e paciente e crie sua conta.'],
  '/recursos': ['Recursos para nutricionistas — Nello', 'Conheça prontuários, avaliações, planos alimentares, agenda e acompanhamento nutricional no Nello.'],
  '/para-pacientes': ['Para pacientes — Nello', 'Seu plano alimentar, diário, metas e mensagens com o nutricionista em uma área de acompanhamento própria.'],
  '/ajuda': ['Ajuda e suporte — Nello', 'Orientações de acesso e canal de suporte do Nello.'],
  '/termos': ['Termos de uso — Nello', 'Condições de uso do Nello.'],
  '/privacidade': ['Privacidade — Nello', 'Informações sobre tratamento de dados e direitos de privacidade.'],
  '/seguranca': ['Segurança — Nello', 'Orientações sobre acesso e segurança da conta.'],
  '/status': ['Status — Nello', 'Disponibilidade dos serviços do Nello.'],
};
const modules = { patients: 'Pacientes', hub: 'Prontuário do paciente', anamnese: 'Anamnese', anthropometry: 'Antropometria', 'energy-expenditure': 'Cálculos nutricionais', 'meal-plan': 'Plano alimentar', financial: 'Financeiro', agenda: 'Agenda', chat: 'Mensagens', notifications: 'Notificações', profile: 'Perfil', diario: 'Diário alimentar', 'add-food': 'Registrar refeição', progresso: 'Progresso', dashboard: 'Visão geral', users: 'Cadastros', verifications: 'Verificações', templates: 'Protocolos', goals: 'Metas', 'lab-results': 'Exames' };
export function getRouteMetadata(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const page = publicPages[path];
  const privateRoute = /^\/(patient|nutritionist|admin)(\/|$)/.test(path);
  // Only allowlisted static segments affect titles. Never interpolate a name,
  // UUID, invitation code, query, hash or user-entered template title.
  const label = privateRoute ? path.split('/').map(part => modules[part]).filter(Boolean).at(-1) || 'Área de acompanhamento' : 'Página não encontrada';
  return { title: page?.[0] || `${label} — Nello`, description: page?.[1] || 'Área de acesso do Nello.', canonical: PUBLIC_ORIGIN + (page ? path : '/'), robots: publicInformationPaths.includes(path) ? 'index,follow' : 'noindex,nofollow' };
}
