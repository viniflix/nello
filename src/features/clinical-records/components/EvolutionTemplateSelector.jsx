import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { listEvolutionTemplates } from '../api/evolution-queries';

const RETROSPECTIVE_THRESHOLD_MS = 5 * 60 * 1000;

const toLocalDateTimeValue = (date = new Date()) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
};

const EvolutionTemplateSelector = ({ open, onOpenChange, onSelectTemplate }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(null);
  const [error, setError] = useState(null);
  const [encounterAt, setEncounterAt] = useState(() => toLocalDateTimeValue());
  const [visibility, setVisibility] = useState('professional_private');
  const [retrospectiveReason, setRetrospectiveReason] = useState('');
  const templatesRequestRef = useRef(0);
  const submissionRequestRef = useRef(0);

  const loadTemplates = useCallback(async () => {
    const requestId = ++templatesRequestRef.current;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await listEvolutionTemplates();
    if (requestId !== templatesRequestRef.current) return;
    if (fetchError) {
      setTemplates([]);
      setError(fetchError.message || 'Erro ao carregar modelos clínicos.');
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void loadTemplates();
    return () => {
      templatesRequestRef.current += 1;
    };
  }, [loadTemplates, open]);

  useEffect(() => {
    if (!open) {
      submissionRequestRef.current += 1;
      setSubmittingCode(null);
    }
  }, [open]);

  const encounterDate = new Date(encounterAt);
  const isValidEncounterDate = !Number.isNaN(encounterDate.getTime());
  const isRetrospective = isValidEncounterDate
    && Date.now() - encounterDate.getTime() > RETROSPECTIVE_THRESHOLD_MS;
  const validReason = !isRetrospective
    || (retrospectiveReason.trim().length >= 10 && retrospectiveReason.trim().length <= 500);

  const handleSelect = async (template) => {
    if (!isValidEncounterDate || !validReason || submittingCode) return;
    const requestId = ++submissionRequestRef.current;
    setSubmittingCode(template.code);
    const succeeded = await onSelectTemplate({
      template,
      encounterAt: encounterDate.toISOString(),
      visibility,
      retrospectiveReason: isRetrospective ? retrospectiveReason.trim() : null,
    });
    if (requestId !== submissionRequestRef.current) return;
    setSubmittingCode(null);
    if (succeeded !== false) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Nova Evolução Clínica</DialogTitle>
          <DialogDescription>
            Defina o contexto do atendimento e selecione o modelo de registro.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Data e hora clínica
            <Input
              type="datetime-local"
              value={encounterAt}
              onChange={(event) => setEncounterAt(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Visibilidade
            <select
              aria-label="Visibilidade"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
            >
              <option value="professional_private">Privada do profissional</option>
              <option value="share_later">Compartilhar posteriormente</option>
              <option value="shared_with_patient">Compartilhada com o paciente</option>
            </select>
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          A visibilidade organiza a rotina assistencial. Notas privadas continuam sujeitas aos
          direitos legais de acesso e exportação aplicáveis.
        </p>

        {isRetrospective ? (
          <label className="flex flex-col gap-2 text-sm font-medium">
            Motivo do registro retroativo
            <Textarea
              value={retrospectiveReason}
              onChange={(event) => setRetrospectiveReason(event.target.value)}
              maxLength={500}
              aria-invalid={!validReason}
              placeholder="Explique por que o registro está sendo feito posteriormente."
            />
            {!validReason ? (
              <span className="text-xs text-destructive">Informe entre 10 e 500 caracteres.</span>
            ) : null}
          </label>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button type="button" variant="outline" size="sm" onClick={loadTemplates}>
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="relative min-h-[220px] flex-1 overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
              <Loader2 className="size-8 animate-spin" aria-hidden="true" />
              <p>Carregando modelos clínicos...</p>
            </div>
          ) : !error && templates.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
              Nenhum modelo clínico disponível.
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="flex flex-col gap-3 pb-4">
                {templates.map((template) => (
                  <button
                    key={template.code}
                    type="button"
                    aria-label={`Usar modelo ${template.name}`}
                    onClick={() => void handleSelect(template)}
                    disabled={Boolean(submittingCode) || !isValidEncounterDate || !validReason}
                    className="group flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <span className="flex size-10 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {submittingCode === template.code
                        ? <Loader2 className="animate-spin" aria-hidden="true" />
                        : <FileText aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{template.name}</span>
                        {template.category === 'system' ? <Badge variant="secondary">Nello</Badge> : null}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{template.description}</span>
                    </span>
                    <ChevronRight className="self-center text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(submittingCode)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvolutionTemplateSelector;
