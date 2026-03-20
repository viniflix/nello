import React, { useState } from 'react';
import { useCheckins } from '@/hooks/useCheckins';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CheckSquare, Plus, BellRing } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CheckinSchedulePanel = ({ patientId }) => {
  const { usePatientSchedules, useTemplates, linkTemplate } = useCheckins();
  const { data: schedules, isLoading: isLoadingSchedules } = usePatientSchedules(patientId);
  const { data: templates, isLoading: isLoadingTemplates } = useTemplates();
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [channel, setChannel] = useState('in_app');

  const handleLink = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    
    // Calculates the next send at correctly based on the template
    const tmplObj = templates?.find(t => t.id === selectedTemplate);
    let nextSend = new Date();
    // Simplified next send logic - Tomorrow at send_time
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/10 border-b">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary" />
            Schedules de Check-in
          </CardTitle>
          <CardDescription>Formulários programados</CardDescription>
        </div>
        <Button onClick={() => setIsLinkModalOpen(true)} size="sm" variant="default" className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Vincular
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoadingSchedules && <p className="text-sm text-muted-foreground animate-pulse">Carregando agendamentos...</p>}
        {!isLoadingSchedules && schedules?.length === 0 && (
          <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded-lg bg-muted/20">
            <CheckSquare className="w-10 h-10 text-muted-foreground mb-3 opacity-30" />
            <p className="text-sm font-medium text-foreground">Sem templates vinculados</p>
            <p className="text-xs text-muted-foreground text-center mt-1">Este paciente não recebe nenhum check-in automatizado.</p>
          </div>
        )}
        
        <div className="space-y-3 mt-2">
          {schedules?.map((schedule) => (
            <div key={schedule.id} className="flex justify-between items-center p-4 border rounded-md hover:bg-muted/10 transition-colors shadow-sm">
              <div>
                <h4 className="font-semibold text-sm text-foreground">{schedule.checkin_templates?.name}</h4>
                <div className="flex items-center gap-4 mt-1.5 text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-full"><Clock className="w-3.5 h-3.5" /> {schedule.checkin_templates?.frequency}</span>
                  <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-full"><BellRing className="w-3.5 h-3.5" /> {new Date(schedule.next_send_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider bg-green-100 text-green-700 px-2 py-1 rounded-md">
                  {schedule.channel}
                </span>
              </div>
            </div>
          ))}
        </div>

        <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Template ao Paciente</DialogTitle>
              <DialogDescription>
                Selecione um template de check-in que será enviado automaticamente na frequência estipulada.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleLink} className="space-y-5 py-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Template Disponível</label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate} required>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione um template..." /></SelectTrigger>
                  <SelectContent>
                    {isLoadingTemplates && <SelectItem value="" disabled>Carregando...</SelectItem>}
                    {templates?.length === 0 && <SelectItem value="" disabled>Nenhum template criado</SelectItem>}
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.frequency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold">Canal de Disparo</label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">App Hipozero (Notificação Push)</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp Z-API</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="mt-6 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setIsLinkModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={!selectedTemplate || linkTemplate.isPending} className="font-semibold">
                  {linkTemplate.isPending ? 'Vinculando...' : 'Vincular Check-in'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default CheckinSchedulePanel;
