import React, { useState, useEffect, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Bell, Check, Trash2, Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const ADMIN_NAV_LINKS = [
  { name: 'Dashboard', path: '/admin/dashboard' },
  { name: 'Usuários', path: '/admin/users' },
  { name: 'Financeiro', path: '/admin/financial' },
];

export default function AdminHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  if (!user) return null;

  const initials = (user.profile?.name || 'A').substring(0, 2).toUpperCase();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Destination when clicking "Voltar"
  const backPath = user.profile?.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
  const backLabel = user.profile?.user_type === 'nutritionist' ? 'Área do Nutricionista' : 'Área do Paciente';

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoadingNotifications(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, type, content, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications(data || []);
    setLoadingNotifications(false);
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClearRead = async () => {
    const readIds = notifications.filter((n) => n.is_read).map((n) => n.id);
    if (!readIds.length) return;
    await supabase.from('notifications').delete().in('id', readIds);
    setNotifications((prev) => prev.filter((n) => !n.is_read));
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await signOut();
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 border-b bg-card px-3 md:px-6 min-w-0 overflow-hidden shadow-sm">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between min-w-0 gap-2">

        {/* Left: Logo + Nav */}
        <div className="flex items-center space-x-4 min-w-0 flex-1">
          {/* Logo / Brand */}
          <Link to="/admin/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200">
              <Shield className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="font-bold text-sm text-foreground hidden sm:inline">Admin</span>
          </Link>

          {/* Nav Links */}
          <nav className="flex items-center space-x-1">
            {ADMIN_NAV_LINKS.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === '/admin/dashboard'}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-indigo-600 bg-indigo-50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`
                }
              >
                {link.name}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right: Notifications + Profile */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Notifications */}
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
            <DropdownMenuContent className="w-72 p-0" align="end">
              <div className="border-b px-3 py-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Notificações</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleMarkAllAsRead} title="Marcar todas como lidas">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClearRead} title="Limpar lidas">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto p-2">
                {loadingNotifications ? (
                  <p className="text-center text-sm text-muted-foreground py-4">Carregando...</p>
                ) : notifications.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">Nenhuma notificação.</p>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      className={`p-2 rounded-md text-xs mb-1 ${n.is_read ? 'opacity-60' : 'bg-primary/5 font-medium'}`}
                    >
                      <p className="text-foreground">{n.content?.message || n.title || 'Nova notificação'}</p>
                    </div>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Divider */}
          <div className="h-6 w-px bg-border hidden md:block" />

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                {user.profile?.avatar_url ? (
                  <div className="h-9 w-9 rounded-full border-2 border-indigo-400 overflow-hidden">
                    <img src={user.profile.avatar_url} alt={user.profile?.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-9 w-9 rounded-full flex items-center justify-center bg-indigo-100 border-2 border-indigo-400">
                    <span className="text-indigo-700 font-semibold text-sm">{initials}</span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1 min-w-0">
                  <p className="text-sm font-medium leading-none truncate">{user.profile?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground truncate">{user.email}</p>
                  <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 mt-1 w-fit">
                    Administrador
                  </span>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => navigate(backPath)} className="text-foreground">
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span>{backLabel}</span>
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
}
