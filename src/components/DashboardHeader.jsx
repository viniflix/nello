import React, { useState, useEffect, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, User, Menu, Bell, Check, Trash2 } from 'lucide-react';
import { useAdminMode } from '@/contexts/AdminModeContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

// Links de navegação principal (Nutritionist)
const getNutritionistLinks = () => {
  return [
    { name: 'Dashboard', path: '/nutritionist' },
    { name: 'Pacientes', path: '/nutritionist/patients' },
    { name: 'Agenda', path: '/nutritionist/agenda' },
    { name: 'Financeiro', path: '/nutritionist/financial' },
    { name: 'Banco de Alimentos', path: '/nutritionist/food-bank' },
  ];
};

// Admin navigation links (removed - access only via Control Bar)
const getAdminLinks = () => {
  return [];
};

const getNotificationText = (notification) => {
  const typeMap = {
    appointment_scheduled: 'Nova consulta agendada',
    appointment_rescheduled: 'Consulta reagendada',
    appointment_canceled: 'Consulta cancelada',
    appointment_reminder: 'Lembrete de consulta',
    new_message: 'Nova mensagem',
    new_meal_plan: 'Novo plano alimentar',
    meal_plan_updated: 'Plano alimentar atualizado',
    new_prescription: 'Nova prescrição de macros',
    prescription_updated: 'Metas atualizadas',
    nutritionist_note: 'Nova orientação',
    daily_log_reminder: 'Lembrete diário',
    measurement_reminder: 'Lembrete de medidas'
  };

  const title = typeMap[notification.type] || 'Nova notificação';
  const message = notification?.content?.message || 'Você recebeu uma atualização.';
  return { title, message };
};

// --- Componente Principal do Header (Nova Versão CLEAN) ---
const DashboardHeader = ({ user, logout }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const { viewMode, isAdmin } = useAdminMode();

  if (!user) return null;

  const initials = (user.profile?.name || 'U').substring(0, 2).toUpperCase();
  
  // Determine which links to show based on viewMode (for admins) or user_type (for regular users)
  let navigationLinks = [];
  let adminLinks = [];
  
  if (isAdmin && viewMode) {
    // Admin in God Mode: show links based on viewMode
    if (viewMode === 'admin') {
      adminLinks = getAdminLinks();
    } else if (viewMode === 'nutritionist') {
      navigationLinks = getNutritionistLinks();
      // Also show admin links if admin wants to access admin features
      adminLinks = getAdminLinks();
    }
    // If viewMode === 'patient', don't show nutritionist links (patient uses different layout)
  } else {
    // Regular user: show links based on user_type
    if (user.profile?.user_type === 'nutritionist') {
      navigationLinks = getNutritionistLinks();
      if (isAdmin) {
        adminLinks = getAdminLinks();
      }
    }
  }
  const shouldShowNotifications = user.profile?.user_type === 'nutritionist' || viewMode === 'nutritionist';
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const fetchNotifications = useCallback(async () => {
    if (!shouldShowNotifications || !user?.id) return;
    setLoadingNotifications(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, content, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível carregar notificações.', variant: 'destructive' });
    } else {
      setNotifications(data || []);
    }
    setLoadingNotifications(false);
  }, [shouldShowNotifications, user?.id, toast]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!shouldShowNotifications || !user?.id) return undefined;
    const channel = supabase
      .channel(`nutritionist-notifications:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, fetchNotifications)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shouldShowNotifications, user?.id, fetchNotifications]);

  const handleMarkAsRead = async (notificationId) => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível marcar como lida.', variant: 'destructive' });
      return;
    }
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)));
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;

    const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível marcar todas como lidas.', variant: 'destructive' });
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClearRead = async () => {
    const readIds = notifications.filter((n) => n.is_read).map((n) => n.id);
    if (!readIds.length) return;

    const { error } = await supabase.from('notifications').delete().in('id', readIds);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível excluir notificações lidas.', variant: 'destructive' });
      return;
    }
    setNotifications((prev) => prev.filter((n) => !n.is_read));
  };

  // Handler para logout que previne comportamentos inesperados
  const handleLogout = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMobileMenuOpen(false);
    await logout();
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b bg-card px-4 md:px-6">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between">

          {/* Lado Esquerdo: Menu Hamburger (Mobile) + Logo + Navegação */}
          <div className="flex items-center space-x-4">
            {/* Menu Hamburger - Apenas Mobile */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col space-y-1 mt-4">
                  {navigationLinks.map((link) => (
                    <NavLink
                      key={link.path}
                      to={link.path}
                      end={link.path === '/nutritionist'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'text-primary bg-primary/10'
                            : 'text-muted-foreground hover:text-primary hover:bg-accent'
                        }`
                      }
                    >
                      {link.name}
                    </NavLink>
                  ))}
                  {adminLinks.length > 0 && (
                    <>
                      <div className="px-4 py-2 mt-4 border-t">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Administração
                        </p>
                      </div>
                      {adminLinks.map((link) => (
                        <NavLink
                          key={link.path}
                          to={link.path}
                          end={link.path === '/admin/dashboard'}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                              isActive
                                ? 'text-primary bg-primary/10'
                                : 'text-muted-foreground hover:text-primary hover:bg-accent'
                            }`
                          }
                        >
                          {link.name}
                        </NavLink>
                      ))}
                    </>
                  )}
                </nav>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <Link to="/nutritionist" className="h-10 flex items-center overflow-hidden">
              <img
                src="https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png"
                alt="HipoZero Logo"
                className="h-10 w-auto"
              />
            </Link>

            {/* Navegação Principal - Desktop */}
            <nav className="hidden md:flex items-center space-x-1">
              {navigationLinks.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  end={link.path === '/nutritionist'}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-primary hover:bg-accent'
                    }`
                  }
                >
                  {link.name}
                </NavLink>
              ))}
              {adminLinks.length > 0 && (
                <>
                  <div className="h-6 w-px bg-border mx-2" />
                  {adminLinks.map((link) => (
                    <NavLink
                      key={link.path}
                      to={link.path}
                      end={link.path === '/admin/dashboard'}
                      className={({ isActive }) =>
                        `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'text-primary bg-primary/10'
                            : 'text-muted-foreground hover:text-primary hover:bg-accent'
                        }`
                      }
                    >
                      {link.name}
                    </NavLink>
                  ))}
                </>
              )}
            </nav>
          </div>

          {/* Lado Direito: Dropdown de Perfil */}
          <div className="flex items-center space-x-4">
            {shouldShowNotifications && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-4 text-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[360px] p-0" align="end">
                  <div className="border-b px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Notificações</p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleMarkAllAsRead} title="Marcar todas como lidas">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClearRead} title="Excluir notificações lidas">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2">
                    {loadingNotifications ? (
                      <p className="px-2 py-6 text-center text-sm text-muted-foreground">Carregando...</p>
                    ) : notifications.length > 0 ? (
                      notifications.map((notification) => {
                        const details = getNotificationText(notification);
                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => handleMarkAsRead(notification.id)}
                            className={`mb-1 w-full rounded-md border p-2 text-left transition-colors hover:bg-muted/60 ${
                              notification.is_read ? 'opacity-70' : 'bg-primary/5'
                            }`}
                          >
                            <p className="text-sm font-medium leading-tight">{details.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{details.message}</p>
                          </button>
                        );
                      })
                    ) : (
                      <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Nome (oculto em telas pequenas) */}
            <span className="hidden lg:inline text-sm font-medium text-foreground">
              {user.profile?.name || 'Nutricionista'}
            </span>

            {/* Dropdown de Perfil */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                  {user.profile?.avatar_url ? (
                    <div className="h-10 w-10 rounded-full border-2 border-primary overflow-hidden">
                      <img
                        src={user.profile.avatar_url}
                        alt={user.profile?.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10 border-2 border-primary">
                      <span className="text-primary font-semibold text-sm">{initials}</span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.profile?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => navigate('/nutritionist/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Meu Perfil</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
