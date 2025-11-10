import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, ArrowLeft } from 'lucide-react'; 
import { Button } from '@/components/ui/button';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';

// Subcomponente para o Avatar e Popover
const UserNav = ({ user, logout }) => {
  if (!user) return null;
  
  const initials = (user.name || 'U').substring(0, 2).toUpperCase();
  const navigate = useNavigate(); 

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          {/* Avatar manual */}
          <div className="relative h-10 w-10 rounded-full flex items-center justify-center bg-emerald-100 border-2 border-primary">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="rounded-full w-full h-full object-cover" />
            ) : (
              <span className="text-primary font-semibold">{initials}</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      {/* Popover usa 'bg-popover' (que agora é #FEFAE0) */}
      <PopoverContent className="w-56 p-2 bg-popover" align="end" forceMount>
        <div className="font-normal p-2">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
        
        <hr className="my-2" />
        
        <Button variant="ghost" className="w-full justify-start font-normal" onClick={() => navigate('/nutritionist/profile')}>
          <User className="mr-2 h-4 w-4" />
          <span>Meu Perfil</span>
        </Button>
        <Button variant="ghost" className="w-full justify-start font-normal" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sair</span>
        </Button>
      </PopoverContent>
    </Popover>
  );
};

// --- Componente Principal do Header (Estilo Figma) ---
const DashboardHeader = ({ user, logout, onToggleNotifications }) => {
  const navigate = useNavigate();
  const location = useLocation(); 
  if (!user) return null;

  const isMainDashboard = location.pathname === '/nutritionist';

  return (
    // Estilos do Figma:
    // - Descolado (margin): m-4 md:m-8
    // - Cor de fundo: bg-background (#FEFAE0)
    // - Quinas redondas: rounded-xl (10px)
    // - Sombra: shadow-figma-btn (que é a sombra customizada)
    <div className="relative m-4 bg-card md:m-4 rounded-xl shadow-figma-btn">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-20">
          
          {/* Lado Esquerdo: Botão Voltar (Condicional) + Logo */}
          <div className="flex items-center space-x-2">
            
            {!isMainDashboard && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5"
                onClick={() => navigate(-1)} // Ação de voltar
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}

            <Link to="/nutritionist" className="h-10 flex items-center overflow-hidden">
              <img 
                src="https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png" 
                alt="HipoZero Logo" 
                className="h-10 w-auto" // Tamanho 50% (40px), sem crop
              />
            </Link>
          </div>

          {/* Lado Direito: Perfil e Sair (cores da paleta) */}
          <div className="flex items-center space-x-4">
            
            {/* "Olá, {Nome Completo}" (Cor #783D19) */}
            <span className="hidden sm:inline text-base font-semibold text-accent">
              Olá, {user.name || 'Nutri'}!
            </span>

            {/* Botão "Meu Perfil" (Cor #783D19) */}
            <Button 
              className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg"
              onClick={() => navigate('/nutritionist/profile')}
            >
              <div className="relative h-6 w-6 rounded-full flex items-center justify-center bg-white/30 overflow-hidden mr-2">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="rounded-full w-full h-full object-cover" />
                ) : (
                  <span className="text-accent-foreground text-xs font-semibold">{initials}</span>
                )}
              </div>
              Meu Perfil
            </Button>

            {/* Botão "Sair" (Cor #C4661F) */}
            <Button 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg"
              onClick={logout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>

          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;