import React, { Suspense, useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from '@/portals/admin/layouts/AdminLayout';
import PatientLayout from '@/portals/patient/layouts/PatientLayout';
import { adminRoutes } from './adminRoutes';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'fictitious', profile: { name: 'Fictitious' } }, signOut: vi.fn() }) }));
vi.mock('@/components/admin/AdminHeader', () => ({ default: () => <nav aria-label="Administrador">Portal</nav> }));
vi.mock('@/components/navigation/PortalBreadcrumbs', () => ({ default: () => null }));
vi.mock('@/contexts/ChatContext', () => ({ useChat: () => ({ unreadSenders: new Set() }) }));
vi.mock('@/hooks/useNotificationsData', () => ({ useNotificationsData: () => ({ unreadCount: 0 }) }));
vi.mock('@/hooks/useOnlinePresence', () => ({ useOnlinePresence: () => {} }));
vi.mock('@/components/NotificationsPanel', () => ({ default: () => null }));

function Editor() {
  const [slow, setSlow] = useState(false);
  if (slow) throw new Promise(() => {});
  return <><input aria-label="Rascunho" defaultValue="fictício" /><button onClick={() => setSlow(true)}>Carregar seção</button></>;
}

describe('portal outlet loading consumers', () => {
  it.each([['admin', AdminLayout], ['patient', PatientLayout]])('preserves %s navigation and mounted draft during suspension', async (_name, Layout) => {
    render(<MemoryRouter><Suspense fallback={<p>Aplicativo aguardando</p>}><Routes><Route element={<Layout />}><Route index element={<Editor />} /></Route></Routes></Suspense></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Rascunho'), { target: { value: 'edição fictícia' } });
    fireEvent.click(screen.getByText('Carregar seção'));
    expect(screen.getAllByRole('navigation').some(element => element.style.display !== 'none')).toBe(true);
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible());
    expect(screen.getByLabelText('Rascunho')).toHaveValue('edição fictícia');
    expect(screen.queryByText('Aplicativo aguardando')).toBeNull();
  });

  it('lets all fourteen admin page routes reach the layout boundary under the existing gates', () => {
    const routes = React.Children.toArray(adminRoutes.props.children);
    const protectedRoute = routes[1];
    expect(protectedRoute.props.element.type.name).toBe('ProtectedRoute');
    expect(protectedRoute.props.element.props.children.type.name).toBe('AdminAccessGate');
    const pages = React.Children.toArray(protectedRoute.props.children);
    expect(pages).toHaveLength(14);
    for (const page of pages) expect(page.props.element.type).not.toBe(Suspense);
  });
});
