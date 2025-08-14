import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { Home, Search, Plus, BarChart2, User, Bell, LogOut, ArrowLeft, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { Button } from '@/components/ui/button';
import NotificationsPanel from '@/components/NotificationsPanel';
import { supabase } from '@/lib/customSupabaseClient';

const NavItem = ({ to, icon: Icon, label, isActive }) => (
  <Link to={to} className="flex flex-col items-center gap-1 w-16">
    <Icon className={`w-6 h-6 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
    <span className={`text-xs font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
  </Link>
);

const AddButton = () => {
    const navigate = useNavigate();
    return (
        <div 
            className="w-16 h-16 rounded-full bg-primary flex items-center justify-center -mt-8 shadow-lg cursor-pointer hover:bg-primary/90 transition-colors"
            onClick={() => navigate('/patient/add-food')}
        >
            <Plus className="w-8 h-8 text-primary-foreground" />
        </div>
    )
};

const PatientLayout = () => {
  const { user, signOut } = useAuth();
  const { unreadSenders } = useChat();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
      const fetchUnread = async () => {
          if(!user) return;
          const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
          setUnreadNotifications(count || 0);
      };
      fetchUnread();
      
      const channel = supabase.channel(`notifications-count:${user?.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user?.id}`}, payload => {
            fetchUnread();
        })
        .subscribe();
    
    return () => { supabase.removeChannel(channel); }
  }, [user]);

  const getHeaderTitle = () => {
    if (!user || !user.profile) return 'HipoZero';
    switch(location.pathname) {
      case '/patient':
        return `Olá, ${user.profile.name.split(' ')[0]}`;
      case '/patient/search':
        return 'Pesquisar Alimento';
      case '/patient/records':
        return 'Histórico';
      case '/patient/profile':
        return 'Meu Perfil';
      case '/chat/patient':
        return 'Chat com Nutri';
      case '/patient/add-food':
        return 'Adicionar Refeição';
      case '/patient/notifications':
        return 'Notificações';
      default:
        if (location.pathname.startsWith('/patient/add-food')) return 'Editar Refeição';
        return 'HipoZero';
    }
  }
  
  const noHeaderOn = ['/patient/add-food', '/patient/add-food/'];
  const hideHeader = noHeaderOn.some(path => location.pathname.startsWith(path) && path.length === location.pathname.length);
  const showBackButtonOn = ['/patient/search', '/patient/records', '/patient/profile', '/chat/patient', '/patient/notifications'];
  const showBackButton = showBackButtonOn.includes(location.pathname) || location.pathname.startsWith('/patient/add-food/');

  return (
    <div className="min-h-screen w-full bg-background font-sans">
      {!hideHeader && (
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
          <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
              <div className="flex items-center gap-2">
                {showBackButton && (
                  <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                )}
                <h1 className="text-xl font-bold text-foreground">{getHeaderTitle()}</h1>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                  <Link to="/chat/patient" className="relative">
                    <MessageSquare className="w-6 h-6 text-muted-foreground" />
                    {unreadSenders.has(user?.profile?.nutritionist_id) && <div className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full" />}
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowNotifications(true)} className="relative">
                  <Bell className="w-6 h-6 text-muted-foreground" />
                  {unreadNotifications > 0 && <div className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full" />}
                </Button>
                {location.pathname === '/patient/profile' && (
                   <Button variant="ghost" size="icon" onClick={signOut}>
                     <LogOut className="w-6 h-6 text-muted-foreground" />
                   </Button>
                )}
              </div>
          </div>
        </header>
      )}
      
      <main className="max-w-4xl mx-auto">
        <Outlet />
      </main>
      
      <footer className="fixed bottom-0 left-0 right-0 z-10 bg-card border-t border-border">
        <div className="max-w-4xl mx-auto h-20 px-4 flex justify-around items-center">
          <NavItem to="/patient" icon={Home} label="Início" isActive={location.pathname === '/patient'} />
          <NavItem to="/patient/search" icon={Search} label="Pesquisa" isActive={location.pathname === '/patient/search'} />
          <AddButton />
          <NavItem to="/patient/records" icon={BarChart2} label="Histórico" isActive={location.pathname === '/patient/records'} />
          <NavItem to="/patient/profile" icon={User} label="Perfil" isActive={location.pathname === '/patient/profile'} />
        </div>
      </footer>
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
};

export default PatientLayout;