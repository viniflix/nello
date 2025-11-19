import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, User, Menu, X } from 'lucide-react';
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

// Links de navegação principal
const navigationLinks = [
  { name: 'Dashboard', path: '/nutritionist' },
  { name: 'Pacientes', path: '/nutritionist/patients' },
  { name: 'Agenda', path: '/nutritionist/agenda' },
  { name: 'Financeiro', path: '/nutritionist/financial' },
  { name: 'Banco de Alimentos', path: '/nutritionist/food-bank' },
];

// --- Componente Principal do Header (Nova Versão CLEAN) ---
const DashboardHeader = ({ user, logout }) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!user) return null;

  const initials = (user.profile?.name || 'U').substring(0, 2).toUpperCase();

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
            </nav>
          </div>

          {/* Lado Direito: Dropdown de Perfil */}
          <div className="flex items-center space-x-4">
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
