import React, { useState } from 'react';
import { useCheckins } from '@/hooks/useCheckins';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CheckSquare, Settings2, Plus } from 'lucide-react';
import CheckinTemplateBuilder from '@/components/nutritionist/CheckinTemplateBuilder';

const CheckinManagerPage = () => {
  const { useTemplates, createTemplate } = useCheckins();
  const { data: templates, isLoading } = useTemplates();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // States para o novo template
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [sendTime, setSendTime] = useState('09:00');
  const [channel, setChannel] = useState('in_app');
  const [fields, setFields] = useState([
    { label: 'Como você avalia sua adesão à dieta nesta semana?', field_type: 'scale_1_10', options: [], score_weight: 1.0, is_required: true }
  ]);

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!name) return;
    
    await createTemplate.mutateAsync({
      template: { name, description, frequency, send_time: sendTime, send_days: [1], channel },
      fields
    });
    
    setIsCreateModalOpen(false);
    // Reset state
    setName('');
    setDescription('');
    setFrequency('weekly');
    setFields([{ label: 'Como você avalia sua adesão à dieta nesta semana?', field_type: 'scale_1_10', options: [], score_weight: 1.0, is_required: true }]);
  };

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <CheckSquare className="w-8 h-8 text-primary" />
            Motor de Check-ins
          </h1>
          <p className="text-muted-foreground mt-1">Crie templates e acompanhe a adesão (LiveClin Core)</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="w-full md:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Novo Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading && <p className="col-span-full">Carregando templates...</p>}
        {!isLoading && templates?.length === 0 && (
          <div className="col-span-full">
            <div className="flex flex-col items-center justify-center p-12 bg-card rounded-xl border border-dashed text-center h-[300px]">
              <CheckSquare className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground">Nenhum formulário criado</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Crie seu primeiro formulário automático de check-in paramétricas de adesão e envie aos pacientes.
              </p>
              <Button onClick={() => setIsCreateModalOpen(true)} className="mt-6 font-semibold" variant="default">
                <Plus className="w-4 h-4 mr-2" />
                Começar agora
              </Button>
            </div>
          </div>
        )}
        
        {templates?.map((template) => (
          <Card key={template.id} className="flex flex-col border border-border/60 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300">
            <CardHeader className="pb-3 relative overflow-hidden bg-muted/20">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl line-clamp-1">{template.name}</CardTitle>
                <div className="bg-primary/10 text-primary text-xs font-semibold px-2 py-1 rounded-md">
                  {template.channel === 'whatsapp' ? 'WhatsApp' : 'In-App'}
                </div>
              </div>
              <CardDescription className="line-clamp-2 min-h-10 text-sm mt-2">
                {template.description || 'Sem descrição'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-3 pt-4">
              <div className="space-y-3 text-sm font-medium text-muted-foreground">
                <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-md">
                  <Clock className="w-4 h-4 text-primary/70" />
                  Envio: {template.frequency === 'daily' ? 'Diário' : 
                         template.frequency === 'weekly' ? 'Semanal' : 
                         template.frequency === 'biweekly' ? 'Quinzenal' : 'Mensal'} às {template.send_time.substring(0, 5)}
                </div>
                <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-md">
                  <CheckSquare className="w-4 h-4 text-green-600/70" />
                  {template.checkin_fields?.length || 0} perguntas (cálculo automático)
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-3 border-t bg-muted/10 flex gap-2">
              <Button className="w-full h-9 flex-1 group" variant="outline" size="sm">
                <Settings2 className="w-4 h-4 mr-2 group-hover:rotate-45 transition-transform" />
                Editar
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="px-6 py-4 border-b bg-muted/30">
            <DialogHeader>
              <DialogTitle className="text-xl">Criar Novo Template de Check-in</DialogTitle>
              <DialogDescription>
                Configure as perguntas e escalas que geram o ranking de adesão automática.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1">
            <form id="create-template-form" onSubmit={handleCreateTemplate} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground/90">Nome do Template</Label>
                    <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Relato Fim de Semana" className="h-10" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground/90">Frequência</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diariamente</SelectItem>
                        <SelectItem value="weekly">Semanalmente</SelectItem>
                        <SelectItem value="biweekly">A cada 15 dias</SelectItem>
                        <SelectItem value="monthly">Mensalmente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground/90">Horário de Envio Automático</Label>
                    <Input type="time" required value={sendTime} onChange={e => setSendTime(e.target.value)} className="h-10" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="font-semibold text-foreground/90">Canal de Disparo</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_app">App Hipozero (Notificação Central)</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp Z-API (Requer Sprint 2)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-border">
                <CheckinTemplateBuilder fields={fields} setFields={setFields} />
              </div>
            </form>
          </div>
          <div className="px-6 py-4 border-t bg-muted/30 flex justify-end gap-3 shrink-0">
            <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
            <Button type="submit" form="create-template-form" disabled={createTemplate.isPending || fields.length === 0} className="px-8 font-semibold">
              {createTemplate.isPending ? 'Salvando...' : 'Salvar Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CheckinManagerPage;
