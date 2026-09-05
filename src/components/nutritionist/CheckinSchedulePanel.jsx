import React, { useState } from 'react';
import { useCheckins } from '@/hooks/useCheckins';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, Plus, BellRing } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HubPanel } from '@/components/patient-hub/HubPanel';
import { Skeleton } from '@/components/ui/skeleton';

const frequencyLabels = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal'
};

const formatDate = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Aguardando programação';
  return new Date(value).toLocaleDateString('pt-BR');
};

const CheckinSchedulePanel = ({ patientId }) => {
  const { usePatientSchedules, useTemplates, linkTemplate } = useCheckins();
  const { data: schedules = [], isLoading: isLoadingSchedules, isError: schedulesError, refetch: refetchSchedules } = usePatientSchedules(patientId);
  const { data: templates = [], isLoading: isLoadingTemplates, isError: templatesError, refetch: refetchTemplates } = useTemplates();
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [channel, setChannel] = useState('in_app');

  const handleLink = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    
    const tmplObj = templates?.find(t => t.id === selectedTemplate);
    let nextSend = new Date();
    // O primeiro envio ocorre no dia seguinte; a recorrência permanece definida no template.
    nextSend.setDate(nextSend.getDate() + 1);
    const [h, m] = (tmplObj?.send_time || '09:00').split(':');
    nextSend.setHours(parseInt(h), parseInt(m), 0, 0);

    await linkTemplate.mutateAsync({
      templateId: selectedTemplate,
      patientId,
      nextSendAt: nextSend.toISOString(),
      channel
    });
    
    setIsLinkModalOpen(false);
    setSelectedTemplate('');
  };

  const openDialog = () => {
    setSelectedTemplate('');
    setChannel('in_app');
    setIsLinkModalOpen(true);
  };

  return (
    <HubPanel
      title="Agendamentos de check-in"
      description="Formulários programados para este paciente"
      action={<Button onClick={openDialog} size="sm"><Plus className="mr-1.5 h-4 w-4" />Vincular</Button>}
    >
        {isLoadingSchedules && <div role="status" aria-label="Carregando agendamentos" className="space-y-3"><Skeleton className="h-16 w-full rounded-lg" /><Skeleton className="h-16 w-full rounded-lg" /></div>}
        {!isLoadingSchedules && schedulesError && <div className="space-y-3"><p className="text-sm text-slate-600">Não foi possível carregar os agendamentos.</p><Button size="sm" variant="outline" onClick={() => refetchSchedules()}>Recarregar</Button></div>}
        {!isLoadingSchedules && !schedulesError && schedules.length === 0 && <p className="text-sm leading-relaxed text-muted-foreground">Nenhum formulário está vinculado a este paciente.</p>}

        {!isLoadingSchedules && !schedulesError && schedules.length > 0 && <ul className="divide-y divide-slate-100">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="py-3 first:pt-0 last:pb-0">
              <p className="break-words text-[13px] font-semibold text-slate-900">{schedule.checkin_templates?.name || 'Check-in'}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{frequencyLabels[schedule.checkin_templates?.frequency] || 'Recorrência definida'}</span>
                <span className="flex items-center gap-1"><BellRing className="h-3.5 w-3.5" />Próximo: {formatDate(schedule.next_send_at)}</span>
              </div>
            </li>
          ))}
        </ul>}

        <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular formulário ao paciente</DialogTitle>
              <DialogDescription>
                Selecione um formulário. O primeiro envio será agendado para amanhã no horário configurado.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleLink} className="space-y-5 py-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Formulário disponível</label>
                <Select name="checkin-template" value={selectedTemplate} onValueChange={setSelectedTemplate} required>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione um template..." /></SelectTrigger>
                  <SelectContent>
                    {isLoadingTemplates && <div className="px-2 py-2"><Skeleton className="h-5 w-full" /></div>}
                    {!isLoadingTemplates && templatesError && <div className="space-y-2 px-2 py-2 text-xs text-destructive"><p>Não foi possível carregar os formulários.</p><Button type="button" size="sm" variant="outline" onClick={() => refetchTemplates()}>Tentar novamente</Button></div>}
                    {!isLoadingTemplates && !templatesError && templates.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum formulário criado.</p>}
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.frequency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold">Canal de envio</label>
                <Select name="checkin-channel" value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">Aplicativo Nello</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="mt-6 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setIsLinkModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={!selectedTemplate || linkTemplate.isPending} className="font-semibold">
                  {linkTemplate.isPending ? 'Vinculando…' : 'Vincular check-in'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
    </HubPanel>
  );
};

export default CheckinSchedulePanel;
