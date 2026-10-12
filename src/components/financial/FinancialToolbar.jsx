import React from 'react';
import { addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Settings, Briefcase, Download, ChevronLeft, ChevronRight, ChevronDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonthInputWithCalendar } from '@/components/ui/date-input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

export default function FinancialToolbar({ month, onMonthChange, onNew, onSettings, onServices, exportDisabled, onExportPDF, onExportCSV, onExportReport }) {
  const period = format(month, 'MMMM yyyy', { locale: ptBR });
  return <header className="space-y-4">
    <div className="financial-toolbar-heading flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="mb-1 text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">Gestão do consultório</p><h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground md:text-3xl">Financeiro</h1></div>
      <Button onClick={onNew} aria-label="Nova Transação" className="financial-new-button min-h-11 shrink-0 gap-2 rounded-xl shadow-sm transition-colors duration-200 motion-reduce:transition-none"><Plus className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="hidden sm:inline" aria-hidden="true">Nova Transação</span><span className="sm:hidden" aria-hidden="true">Lançar</span></Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="financial-period flex min-w-0 flex-wrap items-center gap-1 sm:gap-2">
        <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 rounded-xl" aria-label="Mês anterior" onClick={() => onMonthChange(format(addMonths(month, -1), 'yyyy-MM'))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
        <div className="financial-period-field"><label htmlFor="financial-month" className="sr-only">Mês do financeiro</label><MonthInputWithCalendar id="financial-month" aria-label="Mês do financeiro" value={format(month, 'yyyy-MM')} onChange={onMonthChange} className="w-full" /></div>
        <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 rounded-xl" aria-label="Próximo mês" onClick={() => onMonthChange(format(addMonths(month, 1), 'yyyy-MM'))}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        <span className="sr-only" role="status">Período selecionado: {period}</span>
      </div>
      <div className="financial-toolbar-actions grid w-full grid-cols-3 items-center gap-1 border-t pt-3 sm:flex sm:w-auto sm:border-0 sm:pt-0">
        <Button variant="ghost" onClick={onServices} aria-label="Gerenciar Serviços" className="min-h-11 gap-2 rounded-xl"><Briefcase className="h-4 w-4" aria-hidden="true" /><span>Serviços</span></Button>
        <Button variant="ghost" onClick={onSettings} className="min-h-11 gap-2 rounded-xl" aria-label="Configurações financeiras"><Settings className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline" aria-hidden="true">Configurações</span><span className="sm:hidden" aria-hidden="true">Ajustes</span></Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" aria-label="Exportar mês" disabled={exportDisabled} className="min-h-11 gap-2 rounded-xl"><Download className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline" aria-hidden="true">Exportar mês</span><span className="sm:hidden" aria-hidden="true">Exportar</span><ChevronDown className="hidden h-3 w-3 sm:block" aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)] motion-reduce:animate-none"><DropdownMenuLabel className="max-w-[260px] whitespace-normal text-xs font-normal">Mês completo de {period}. Os filtros da tabela não alteram a exportação.</DropdownMenuLabel><DropdownMenuSeparator />{[[onExportPDF, 'Exportar PDF'], [onExportCSV, 'Exportar CSV'], [onExportReport, 'Relatório Completo (CSV)']].map(([action, label]) => <DropdownMenuItem className="min-h-11" key={label} onSelect={action}><FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />{label}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </header>;
}
