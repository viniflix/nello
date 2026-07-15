import { Home, BookMarked, LineChart, MessagesSquare, User } from 'lucide-react';

export const PATIENT_NAV_ITEMS = [
  { to: '/patient', icon: Home, label: 'Início', end: true },
  { to: '/patient/diario', icon: BookMarked, label: 'Plano' },
  { to: '/patient/progresso', icon: LineChart, label: 'Progresso', activeOn: ['/patient/progresso', '/patient/registros-clinicos'] },
  { to: '/patient/chat', icon: MessagesSquare, label: 'Chat', showsChatBadge: true },
  { to: '/patient/perfil', icon: User, label: 'Perfil' },
];

export const isPatientNavItemActive = (item, pathname, routerActive = false) => routerActive
  || item.activeOn?.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  || false;
