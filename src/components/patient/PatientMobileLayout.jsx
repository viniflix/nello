import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, BookMarked, LineChart, MessagesSquare, User, Bell, LogOut, Shield } from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import NotificationsPanel from '@/components/NotificationsPanel';
import AdminControlBar from '@/components/admin/AdminControlBar';
import { supabase } from '@/lib/customSupabaseClient';
import { useState, useEffect } from 'react';

/**
 * PatientMobileLayout - Layout responsivo para Área do Paciente
 *
 * Desktop (md+): Sidebar fixa à esquerda
 * Mobile: BottomNav fixo inferior
 */
export default function PatientMobileLayout() {
  const { user, signOut } = useAuth();
  const { unreadSenders } = useChat();
  const location = useLocation();
  const unreadCount = unreadSenders?.size || 0;
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  // Debug: Log admin status
  useEffect(() => {
    if (user?.profile) {
      console.log('[PatientMobileLayout] User profile:', {
        id: user.profile.id,
        user_type: user.profile.user_type,
        is_admin: user.profile.is_admin,
        hasIsAdmin: 'is_admin' in (user.profile || {})
      });
    }
  }, [user]);

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

  const navItems = [
    {
      to: '/patient',
      icon: Home,
      label: 'Início',
      end: true
    },
    {
      to: '/patient/diario',
      icon: BookMarked,
      label: 'Plano'
    },
    {
      to: '/patient/progresso',
      icon: LineChart,
      label: 'Progresso'
    },
    {
      to: '/patient/chat',
      icon: MessagesSquare,
      label: 'Chat',
      badge: unreadCount
    },
    {
      to: '/patient/perfil',
      icon: User,
      label: 'Perfil'
    }
  ];

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-screen overflow-hidden bg-slate-50">
      {/* SIDEBAR (Desktop apenas) */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-30">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary">Área do Paciente</h1>
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
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                    <span className={isActive ? 'font-semibold' : 'font-medium'}>
                      {item.label}
                    </span>
                    {item.badge > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Botão de Sair */}
        <div className="p-4 border-t border-gray-200">
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-700 hover:bg-gray-100"
            onClick={signOut}
          >
            <LogOut className="w-5 h-5 mr-3" />
            <span className="font-medium">Sair</span>
          </Button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className={`flex-1 md:ml-64 ${isChatPage ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <Outlet />
      </main>

      {/* BOTTOM NAV (Mobile apenas) */}
      <nav className="md:hidden w-full shrink-0 bg-white border-t border-gray-200 z-50 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center flex-1 h-full px-2 transition-colors ${
                    isActive ? 'text-primary' : 'text-gray-500'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                          {item.badge > 9 ? '9' : item.badge}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs mt-1 ${isActive ? 'font-semibold' : 'font-normal'}`}>
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* PAINEL DE NOTIFICAÇÕES */}
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />

      {/* ADMIN CONTROL BAR (apenas para admins) */}
      <AdminControlBar />
    </div>
  );
}
