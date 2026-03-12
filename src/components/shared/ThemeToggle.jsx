import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Monitor } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          {theme === 'light' && <Sun className="h-[1.2rem] w-[1.2rem] text-orange-500" />}
          {theme === 'dark' && <Moon className="h-[1.2rem] w-[1.2rem] text-slate-100" />}
          {theme === 'system' && <Monitor className="h-[1.2rem] w-[1.2rem] text-slate-500 dark:text-slate-400" />}
          <span className="sr-only">Alternar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" /> Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" /> Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" /> Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
