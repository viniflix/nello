import React, { useState, useEffect, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Bell, Check, Trash2, Shield, ArrowLeft, Menu, LayoutDashboard, Settings, Users, Bug, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const NAV_ITEMS = [
  { section: 'Principal', items: [{ name: 'ERP Dashboard', path: '/admin/dashboard', icon: LayoutDashboard }] },
  { section: 'Análises', items: [
    { name: 'Comportamento', path: '/admin/study', icon: Activity },
    { name: 'Performance', path: '/admin/bugs', icon: Bug },
  ]},
  { section: 'Gestão', items: [
    { name: 'Usuários', path: '/admin/users', icon: Users },
    { name: 'Financeiro', path: '/admin/financial', icon: Settings },
  ]},
];

export default function AdminHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const backPath = user?.profile?.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
  const backLabel = user?.profile?.user_type === 'nutritionist' ? 'Área do Nutricionista' : 'Área do Paciente';

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoadingNotifications(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, content, is_read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
    setLoadingNotifications(false);
  }, [user?.id]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const initials = (user?.profile?.name || 'A').substring(0, 2).toUpperCase();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    try {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleClearRead = async () => {
    const readIds = notifications.filter((n) => n.is_read).map((n) => n.id);
    if (!readIds.length) return;
    try {
      await supabase.from('notifications').delete().in('id', readIds);
      setNotifications((prev) => prev.filter((n) => !n.is_read));
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await signOut();
  };

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 border-b bg-card px-3 md:px-6 shadow-sm">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4">
          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-6 border-b">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-indigo-600" />
                    </div>
                    <SheetTitle className="text-lg font-bold">Admin Console</SheetTitle>
                  </div>
                </SheetHeader>
                <nav className="flex flex-col p-2 pt-4">
                  {NAV_ITEMS.map((group) => (
                    <div key={group.section} className="mb-4">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 mb-2">{group.section}</p>
                      {group.items.map((item) => {
                        const IconComponent = item.icon;
                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent"
                          >
                            <IconComponent className="w-4 h-4" />{item.name}
                          </NavLink>
                        );
                      })}
                    </div>
                  ))}
                  <div className="mt-4 pt-4 border-t px-4">
                    <Button variant="ghost" className="w-full justify-start px-0 h-auto py-2 text-sm" onClick={() => { setIsMobileMenuOpen(false); navigate(backPath); }}>
                      <ArrowLeft className="mr-2 h-4 w-4" />{backLabel}
                    </Button>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          <Link to="/admin/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="font-bold text-sm hidden sm:inline">Admin Console</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((group) => {
              const SectionIcon = group.items[0].icon;
              return (
                <div key={group.section} className="relative group">
                  <button className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1">
                    <SectionIcon className="w-4 h-4" />{group.section}
                  </button>
                  <div className="absolute top-full left-0 mt-1 w-48 rounded-md border bg-popover shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <div className="p-1">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            className="flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
                          >
                            <ItemIcon className="w-4 h-4" />{item.name}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
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
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleMarkAllAsRead}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClearRead}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto p-2">
                {loadingNotifications ? (
                  <p className="text-center text-sm text-muted-foreground py-4">Carregando...</p>
                ) : notifications.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">Nenhuma notificação.</p>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className="p-2 rounded-md text-xs mb-1 bg-primary/5 font-medium">
                      <p className="text-foreground">{n.content?.message || n.title || 'Nova notificação'}</p>
                    </div>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-6 w-px bg-border hidden md:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                {user.profile?.avatar_url ? (
                  <div className="h-9 w-9 rounded-full border-2 border-indigo-400 overflow-hidden">
                    <img src={user.profile.avatar_url} alt={user.profile?.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-9 w-9 rounded-full bg-indigo-100 border-2 border-indigo-400 flex items-center justify-center">
                    <span className="text-indigo-700 font-semibold text-sm">{initials}</span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium truncate">{user.profile?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 mt-1 w-fit">Administrador</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(backPath)}><ArrowLeft className="mr-2 h-4 w-4" /><span>{backLabel}</span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" /><span>Sair</span></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
