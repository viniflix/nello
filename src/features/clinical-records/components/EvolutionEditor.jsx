import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, FileSignature, FileText, Lock, XCircle } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicalAmendment } from '../hooks/useClinicalAmendment';
import { useClinicalEvolution } from '../hooks/useClinicalEvolution';
import {
  getMeaningfulClinicalText,
  isContentMinimallyValid,
  RECORD_STATUS_COLORS,
  RECORD_STATUS_LABELS,
} from '../model/evolutionSchema';
import { listEvolutionTemplates } from '../api/evolution-queries';
import RichTextEditor from './RichTextEditor';
import SaveStatusIndicator from './SaveStatusIndicator';
import ClinicalRecordAmendmentDialog from './ClinicalRecordAmendmentDialog';
import ClinicalRecordComparison from './ClinicalRecordComparison';
import ClinicalRecordVersionHistory from './ClinicalRecordVersionHistory';

const RETROSPECTIVE_THRESHOLD_MS = 5 * 60 * 1000;

const correctionAmendmentFrom = (record, chain = []) => {
  if (!record) return null;
  const chainRecord = chain.find((candidate) => candidate.id === record.id);
  const amendment = chainRecord?.amendment || record.amendment || {};
  const flatSource = chainRecord || record;
  const type = amendment.type || amendment.amendment_type || flatSource.amendment_type;
  const status = amendment.status || amendment.amendment_status || flatSource.amendment_status;
  if (type !== 'correction') return null;
  return {
    id: amendment.id || amendment.amendment_id || flatSource.amendment_id || null,
    type,
    status,
    reason: amendment.reason || amendment.amendment_reason || flatSource.amendment_reason || '',
    target_record_id: amendment.target_record_id || flatSource.replaces_record_id || null,
    replacement_record_id: amendment.replacement_record_id || flatSource.id || null,
  };
};

const EvolutionEditor = ({
  initialRecord,
  onBack,
  currentUserId,
  onReplacementOpen,
  onRecordsRefresh,
}) => {
  const { user, signIn } = useAuth();
  const {
    record,
    content,
    visibility,
    status: hookStatus,
    error: hookError,
    conflict,
    hasUnsavedChanges,
    lastSaved,
    setContent,
    setVisibility,
    forceSave,
    finalize,
    sign,
  } = useClinicalEvolution(initialRecord);
  const {
    impact,
    chain,
    comparison,
    status: amendmentStatus,
    error: amendmentError,
    loadImpact,
    loadChain,
    startCorrection,
    invalidateRecord,
    compareVersions,
  } = useClinicalAmendment(record?.id, record?.root_record_id);

  const [templates, setTemplates] = useState([]);
  const [activeSection, setActiveSection] = useState('');
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [retrospectiveReason, setRetrospectiveReason] = useState(
    initialRecord?.retrospective_reason || '',
  );
  const [leaving, setLeaving] = useState(false);
  const [amendmentMode, setAmendmentMode] = useState(null);
  const [chainLoaded, setChainLoaded] = useState(false);

  const isDraft = record?.status === 'draft';
  const isFinalized = record?.status === 'finalized';
  const responsibleSignerId = record?.student_id ? record?.supervisor_id : record?.nutritionist_id;
  const canSign = isFinalized && currentUserId === responsibleSignerId;
  const amendment = correctionAmendmentFrom(record, chain);
  const isCorrectionDraft = Boolean(
    record?.replaces_record_id
    && amendment?.type === 'correction'
    && amendment.status === 'draft',
  );
  const amendmentReason = amendment?.reason || '';
  const currentSignedRecord = [...chain]
    .sort((left, right) => Number(right.chain_version || 0) - Number(left.chain_version || 0))
    .find((candidate) => candidate.status === 'signed');
  const hasOpenCorrection = chain.some((candidate) => (
    correctionAmendmentFrom(candidate, chain)?.status === 'draft'
  ));
  const canAmend = chainLoaded
    && record?.status === 'signed'
    && record.id === currentSignedRecord?.id
    && !hasOpenCorrection
    && currentUserId === responsibleSignerId;
  const historyChain = chain.length > 0 ? chain : (record ? [record] : []);
  const amendmentPending = [
    'loading-impact',
    'starting-correction',
    'invalidating-record',
  ].includes(amendmentStatus);
  const color = RECORD_STATUS_COLORS[record?.status] || 'zinc';

  useEffect(() => {
    let current = true;
    setChainLoaded(false);
    if (record?.id) {
      void loadChain().then((loadedChain) => {
        if (current && Array.isArray(loadedChain)) setChainLoaded(true);
      });
    }
    return () => { current = false; };
  }, [loadChain, record?.id]);

  useEffect(() => {
    let current = true;
    void listEvolutionTemplates().then(({ data }) => {
      if (current) setTemplates(data || []);
    });
    return () => { current = false; };
  }, []);

  const template = templates.find((candidate) => candidate.code === record?.template_code);
  const sections = useMemo(
    () => record?.template_sections_snapshot || template?.sections || [],
    [record?.template_sections_snapshot, template?.sections],
  );

  useEffect(() => {
    const nextSection = sections.some((section) => section.key === activeSection)
      ? activeSection
      : sections[0]?.key || '';
    if (nextSection !== activeSection) setActiveSection(nextSection);
  }, [activeSection, record?.id, sections]);

  useEffect(() => {
    setRetrospectiveReason(record?.retrospective_reason || '');
  }, [record?.id, record?.retrospective_reason]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const preventUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [hasUnsavedChanges]);

  const activeSectionDefinition = sections.find((section) => section.key === activeSection);
  const isRetrospective = record?.encounter_at && record?.created_at
    ? new Date(record.created_at).getTime() - new Date(record.encounter_at).getTime()
      > RETROSPECTIVE_THRESHOLD_MS
    : Boolean(record?.retrospective_reason);
  const validRetrospectiveReason = !isRetrospective
    || (retrospectiveReason.trim().length >= 10 && retrospectiveReason.trim().length <= 500);

  const handleBack = async () => {
    if (leaving) return;
    setLeaving(true);
    const result = await forceSave();
    if (result.ok) onBack();
    setLeaving(false);
  };

  const handleFinalize = async () => {
    if (!validRetrospectiveReason) return;
    const succeeded = await finalize(isRetrospective ? retrospectiveReason.trim() : null);
    if (succeeded) setShowFinalizeDialog(false);
  };

  const copyLocalContent = async () => {
    const plainText = sections
      .map((section) => `${section.label}\n${getMeaningfulClinicalText(content[section.key])}`)
      .join('\n\n');
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(plainText);
  };

  const openAmendmentDialog = async (mode) => {
    const loadedImpact = await loadImpact();
    if (loadedImpact) setAmendmentMode(mode);
  };

  const handleCorrection = async (reason, impactConfirmation) => {
    const replacement = await startCorrection(reason, impactConfirmation);
    if (!replacement) return;
    const replacementRecordId = replacement.replacement_record_id || replacement.id;
    const enrichedReplacement = {
      ...replacement,
      id: replacement.id || replacementRecordId,
      replaces_record_id: replacement.replaces_record_id || record.id,
      root_record_id: replacement.root_record_id || record.root_record_id || record.id,
      amendment: {
        id: replacement.amendment_id || null,
        type: 'correction',
        status: replacement.amendment_status || 'draft',
        reason,
        target_record_id: record.id,
        replacement_record_id: replacementRecordId,
      },
    };
    setAmendmentMode(null);
    onReplacementOpen?.(enrichedReplacement);
  };

  const handleInvalidation = async (reason, impactConfirmation) => {
    const invalidated = await invalidateRecord(reason, impactConfirmation);
    if (invalidated) {
      setAmendmentMode(null);
      await onRecordsRefresh?.();
    }
  };

  const handleReauthenticate = async (password) => {
    if (!user?.email || typeof signIn !== 'function') return false;
    try {
      const result = await signIn({ email: user.email, password });
      return !result?.error;
    } catch {
      return false;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex flex-none flex-col items-start justify-between gap-4 border-b bg-muted/30 p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void handleBack()}
            disabled={leaving}
            aria-label="Voltar para a lista de evoluções"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{template?.name || 'Evolução Clínica'}</h2>
              <Badge variant="secondary" data-status-color={color}>
                {RECORD_STATUS_LABELS[record?.status] || record?.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Atendimento em {record?.encounter_at
                ? new Date(record.encounter_at).toLocaleString('pt-BR')
                : 'data não informada'}
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-4 sm:w-auto">
          {isDraft ? <SaveStatusIndicator status={hookStatus} error={hookError} lastSaved={lastSaved} /> : null}
          {isDraft ? (
            <Button
              onClick={() => setShowFinalizeDialog(true)}
              disabled={!isContentMinimallyValid(content) || ['finalizing', 'saving', 'conflict'].includes(hookStatus)}
            >
              <Lock data-icon="inline-start" aria-hidden="true" />
              Finalizar
            </Button>
          ) : null}
          {canSign ? (
            <Button onClick={() => void sign()} disabled={hookStatus === 'signing'}>
              <FileSignature data-icon="inline-start" aria-hidden="true" />
              Assinar registro
            </Button>
          ) : null}
          {canAmend ? (
            <>
              <Button type="button" variant="outline" onClick={() => void openAmendmentDialog('correction')} disabled={amendmentPending}>
                <FileText data-icon="inline-start" aria-hidden="true" />
                Corrigir
              </Button>
              <Button type="button" variant="destructive" onClick={() => void openAmendmentDialog('invalidation')} disabled={amendmentPending}>
                <XCircle data-icon="inline-start" aria-hidden="true" />
                Invalidar
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {isCorrectionDraft ? (
        <div className="flex-none px-4 pt-4">
          <Alert>
            <FileText className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              <strong>Correção em preparação.</strong>{' '}
              Alvo: {amendment?.target_record_id || record.replaces_record_id}. Motivo: {amendmentReason || 'Motivo indisponível.'}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {amendmentError ? (
        <div className="flex-none px-4 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{amendmentError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {hookStatus === 'conflict' || conflict ? (
        <div className="flex-none px-4 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Outra sessão alterou este rascunho. Seu conteúdo local foi preservado; copie-o
                antes de comparar com a versão atual.
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyLocalContent()}>
                Copiar conteúdo local
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : hookError && hookStatus === 'error' ? (
        <div className="flex-none px-4 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{hookError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {sections.length > 0 ? (
          <nav aria-label="Seções da evolução" className="w-full flex-none border-r bg-muted/20 md:w-64">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-1 p-2">
                {sections.map((section) => {
                  const isActive = activeSection === section.key;
                  const hasContent = getMeaningfulClinicalText(content[section.key]).length > 0;
                  return (
                    <button
                      key={section.key}
                      type="button"
                      aria-label={section.label}
                      onClick={() => setActiveSection(section.key)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${isActive ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                      <span className="truncate pr-2">{section.label}</span>
                      {hasContent ? <span className="size-1.5 rounded-full bg-primary" aria-label="Possui conteúdo" /> : null}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </nav>
        ) : null}

        <div className="relative min-h-[400px] min-w-0 flex-1">
          <ScrollArea className="h-full">
            <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 md:p-6 lg:p-8">
              {isDraft ? (
                <label className="flex max-w-sm flex-col gap-2 text-sm font-medium">
                  Visibilidade da evolução
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value)}
                    disabled={isCorrectionDraft}
                  >
                    <option value="professional_private">Privada do profissional</option>
                    <option value="share_later">Compartilhar posteriormente</option>
                    <option value="shared_with_patient">Compartilhada com o paciente</option>
                  </select>
                </label>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Notas privadas continuam sujeitas aos direitos legais de acesso e exportação aplicáveis.
              </p>

              {activeSectionDefinition ? (
                <section aria-labelledby={`section-${activeSectionDefinition.key}`}>
                  <div className="mb-4">
                    <h3 id={`section-${activeSectionDefinition.key}`} className="text-lg font-medium">
                      {activeSectionDefinition.label}
                      {activeSectionDefinition.required ? <span aria-label="obrigatória"> *</span> : null}
                    </h3>
                    {activeSectionDefinition.hint ? (
                      <p className="mt-1 text-sm text-muted-foreground">{activeSectionDefinition.hint}</p>
                    ) : null}
                  </div>
                  <RichTextEditor
                    key={`${record?.id}:${activeSectionDefinition.key}`}
                    value={content[activeSectionDefinition.key] || ''}
                    onChange={(html) => setContent((previous) => ({
                      ...previous,
                      [activeSectionDefinition.key]: html,
                    }))}
                    placeholder={`Digite o conteúdo de ${activeSectionDefinition.label.toLowerCase()}...`}
                    disabled={!isDraft}
                    minHeight="min-h-[300px]"
                  />
                </section>
              ) : (
                <p className="py-12 text-center text-muted-foreground">
                  O modelo desta evolução não possui seções disponíveis.
                </p>
              )}
            </div>
          </ScrollArea>

          {!isDraft ? (
            <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-md border bg-muted px-3 py-1.5">
              <Lock aria-hidden="true" />
              <span className="text-xs font-medium">Modo leitura</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-none space-y-4 border-t p-4">
        <ClinicalRecordVersionHistory
          chain={historyChain}
          onSelectRecord={onReplacementOpen}
          onCompare={(leftRecordId, rightRecordId) => void compareVersions(leftRecordId, rightRecordId)}
        />
        {comparison ? <ClinicalRecordComparison comparison={comparison} /> : null}
      </div>

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar registro clínico</DialogTitle>
            <DialogDescription>
              A finalização torna o conteúdo imutável. A assinatura profissional ocorre na etapa seguinte.
            </DialogDescription>
          </DialogHeader>
          {isRetrospective ? (
            <label className="flex flex-col gap-2 text-sm font-medium">
              Motivo do registro retroativo
              <Textarea
                value={retrospectiveReason}
                onChange={(event) => setRetrospectiveReason(event.target.value)}
                maxLength={500}
                aria-invalid={!validRetrospectiveReason}
              />
              {!validRetrospectiveReason ? (
                <span className="text-xs text-destructive">Informe entre 10 e 500 caracteres.</span>
              ) : null}
            </label>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)} disabled={hookStatus === 'finalizing'}>
              Cancelar
            </Button>
            <Button onClick={() => void handleFinalize()} disabled={hookStatus === 'finalizing' || !validRetrospectiveReason}>
              {hookStatus === 'finalizing' ? 'Finalizando...' : 'Finalizar registro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClinicalRecordAmendmentDialog
        open={amendmentMode === 'correction'}
        mode="correction"
        impact={impact}
        onOpenChange={(nextOpen) => { if (!nextOpen) setAmendmentMode(null); }}
        onConfirm={handleCorrection}
        pending={amendmentPending}
      />
      <ClinicalRecordAmendmentDialog
        open={amendmentMode === 'invalidation'}
        mode="invalidation"
        impact={impact}
        onOpenChange={(nextOpen) => { if (!nextOpen) setAmendmentMode(null); }}
        onConfirm={handleInvalidation}
        onReauthenticate={user?.email ? handleReauthenticate : undefined}
        pending={amendmentPending}
      />
    </div>
  );
};

export default EvolutionEditor;
