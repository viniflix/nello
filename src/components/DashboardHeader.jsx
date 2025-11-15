import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Links de navegação principal
const navigationLinks = [
  { name: 'Dashboard', path: '/nutritionist' },
  { name: 'Pacientes', path: '/nutritionist/patients' },
  { name: 'Agenda', path: '/nutritionist/agenda' },
  { name: 'Financeiro', path: '/nutritionist/financeiro' },
  { name: 'Calculadora', path: '/nutritionist/macro-calculator' },
  { name: 'Banco de Alimentos', path: '/nutritionist/food-bank' },
];

// --- Componente Principal do Header (Nova Versão CLEAN) ---
const DashboardHeader = ({ user, logout }) => {
  const navigate = useNavigate();
  if (!user) return null;

  const initials = (user.name || 'U').substring(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b bg-card px-4 md:px-6">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between">

          {/* Lado Esquerdo: Logo + Navegação */}
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <Link to="/nutritionist" className="h-10 flex items-center overflow-hidden">
              <img
                src="https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png"
                alt="HipoZero Logo"
                className="h-10 w-auto"
              />
            </Link>

            {/* Navegação Principal */}
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
            </nav>
          </div>

          {/* Lado Direito: Dropdown de Perfil */}
          <div className="flex items-center space-x-4">
            {/* Nome (oculto em telas pequenas) */}
            <span className="hidden lg:inline text-sm font-medium text-foreground">
              {user.name || 'Nutricionista'}
            </span>

            {/* Dropdown de Perfil */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                  {user.avatar_url ? (
                    <div className="h-10 w-10 rounded-full border-2 border-primary overflow-hidden">
                      <img
                        src={user.avatar_url}
                        alt={user.name}
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
                    <p className="text-sm font-medium leading-none">{user.name}</p>
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

                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
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
