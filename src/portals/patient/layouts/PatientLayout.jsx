import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Shield } from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';
import { Button } from '@/components/ui/button';
import NotificationsPanel from '@/components/NotificationsPanel';
import { supabase } from '@/lib/customSupabaseClient';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';
import { isPatientNavItemActive, PATIENT_NAV_ITEMS } from './patientNavigation';

/**
 * PatientLayout - Layout responsivo para Área do Paciente
 *
 * Desktop (md+): Sidebar fixa à esquerda
 * Mobile: BottomNav fixo inferior
 */
export default function PatientLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { unreadSenders } = useChat();
  const location = useLocation();
  const unreadCount = unreadSenders?.size || 0;
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  // Register patient presence on Supabase Realtime so the nutritionist
  // can see this patient as "Online" in the patients list.
  useOnlinePresence();


  // Check if current route is chat page (chat handles its own internal scroll)
  const isChatPage = location.pathname.includes('/chat');

  // Buscar notificações não lidas
  useEffect(() => {
    const fetchUnread = async () => {
      if (!user) return;
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadNotifications(count || 0);
    };

    fetchUnread();

    // Realtime subscription
    const channel = supabase
      .channel(`notifications-count:${user?.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user?.id}`
      }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Exportar para uso nas páginas via context ou props
  // Por enquanto, vamos passar via window global temporariamente
  useEffect(() => {
    window.patientNotifications = {
      unreadCount: unreadNotifications,
      showPanel: () => setShowNotifications(true)
    };
  }, [unreadNotifications]);

  const navItems = PATIENT_NAV_ITEMS.map((item) => ({
    ...item,
    badge: item.showsChatBadge ? unreadCount : undefined,
  }));

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-background md:flex-row">
      {/* SIDEBAR (Desktop apenas) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-card md:flex md:w-64 md:flex-col">
        <div className="border-b border-border p-6">
          <h1 className="font-heading text-xl font-bold uppercase tracking-wide text-primary">Área do Paciente</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors relative ${
                    isPatientNavItemActive(item, location.pathname, isActive)
                      ? 'bg-primary text-white'
                      : 'text-foreground hover:bg-primary/10'
                  }`
                }
              >
                {({ isActive }) => {
                  const itemIsActive = isPatientNavItemActive(item, location.pathname, isActive);
                  return (
                  <>
                    <Icon className="w-5 h-5" strokeWidth={itemIsActive ? 2.5 : 2} />
                    <span className={itemIsActive ? 'font-semibold' : 'font-medium'}>
                      {item.label}
                    </span>
                    {item.badge > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    )}
                  </>
                  );
                }}
              </NavLink>
            );
          })}
        </nav>

        {/* Botão de Painel Admin (Apenas se for Admin) */}
        {user?.profile?.is_admin === true && (
          <div className="border-t border-border p-4">
            <Button
              variant="default"
              className="w-full justify-start bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate('/admin/dashboard')}
            >
              <Shield className="w-5 h-5 mr-3" />
              <span className="font-medium">Painel Admin</span>
            </Button>
          </div>
        )}

        {/* Botão de Sair */}
        <div className="border-t border-border p-4">
          <Button
            variant="ghost"
            className="w-full justify-start text-foreground hover:bg-primary/10"
            onClick={signOut}
          >
            <LogOut className="w-5 h-5 mr-3" />
            <span className="font-medium">Sair</span>
          </Button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className={`min-h-0 min-w-0 flex-1 md:ml-64 ${isChatPage ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <Outlet />
      </main>

      {/* BOTTOM NAV (Mobile apenas) */}
      <nav className="safe-area-inset-bottom z-50 w-full shrink-0 border-t border-border bg-card md:hidden">
        <div className="flex h-16 items-center justify-around px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-w-0 flex-1 flex-col items-center justify-center h-full px-0.5 transition-colors ${
                    isPatientNavItemActive(item, location.pathname, isActive) ? 'text-primary' : 'text-muted-foreground'
                  }`
                }
              >
                {({ isActive }) => {
                  const itemIsActive = isPatientNavItemActive(item, location.pathname, isActive);
                  return (
                  <>
                    <div className="relative">
                      <Icon className="w-6 h-6" strokeWidth={itemIsActive ? 2.5 : 2} />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                          {item.badge > 9 ? '9' : item.badge}
                        </span>
                      )}
                    </div>
                    <span className={`mt-1 max-w-full truncate text-[10px] min-[375px]:text-xs ${itemIsActive ? 'font-semibold' : 'font-normal'}`}>
                      {item.label}
                    </span>
                  </>
                  );
                }}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* BOTÃO FLUTUANTE ADMIN (Mobile apenas, apenas para admins pacientes) */}
      {user?.profile?.is_admin === true && (
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-primary-foreground shadow-lg transition-all duration-200 hover:bg-primary/90 active:scale-95 md:hidden"
          aria-label="Acessar Painel Admin"
        >
          <Shield className="w-4 h-4" />
          <span className="text-xs font-semibold">Admin</span>
        </button>
      )}

      {/* PAINEL DE NOTIFICAÇÕES */}
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
}
