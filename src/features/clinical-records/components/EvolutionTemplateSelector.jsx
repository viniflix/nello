import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { listEvolutionTemplates } from '../api/evolution-queries';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const EvolutionTemplateSelector = ({ open, onOpenChange, onSelectTemplate }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && templates.length === 0) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await listEvolutionTemplates();
    if (fetchError) {
      setError(fetchError.message || 'Erro ao carregar templates');
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  const handleSelect = (template) => {
    onSelectTemplate(template);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">Nova Evolução Clínica</DialogTitle>
          <DialogDescription>
            Selecione o modelo de registro mais adequado para este atendimento.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex-1 overflow-hidden mt-2 relative min-h-[300px]">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Carregando modelos clínicos...</p>
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-3 pb-4">
                {templates.map((template) => (
                  <button
                    key={template.code}
                    onClick={() => handleSelect(template)}
                    className="w-full text-left group flex items-start gap-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                          {template.name}
                        </h4>
                        {template.category === 'system' && (
                          <Badge variant="secondary" className="text-[10px] font-normal px-1.5">Nello</Badge>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {template.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {template.sections?.slice(0, 3).map((s, i) => (
                          <span key={i} className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded">
                            {s.label.split(' ')[0]}
                          </span>
                        ))}
                        {template.sections?.length > 3 && (
                          <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded">
                            +{template.sections.length - 3} seções
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-zinc-300 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors self-center">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        
        <DialogFooter className="mt-2 border-t pt-4 border-zinc-200 dark:border-zinc-800">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvolutionTemplateSelector;
