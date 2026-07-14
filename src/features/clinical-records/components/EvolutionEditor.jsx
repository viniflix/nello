import React, { useState, useEffect } from 'react';
import { useClinicalEvolution } from '../hooks/useClinicalEvolution';
import RichTextEditor from './RichTextEditor';
import SaveStatusIndicator from './SaveStatusIndicator';
import { RECORD_STATUS_LABELS, RECORD_STATUS_COLORS, isContentMinimallyValid } from '../model/evolutionSchema';
import { listEvolutionTemplates } from '../api/evolution-queries';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, Lock, FileSignature, ArrowLeft, AlertCircle, Download } from 'lucide-react';
import { exportEvolutionAsPdf } from '@/lib/utils/exportEvolutionAsPdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const EvolutionEditor = ({ initialRecord, onBack, currentUserId, canCosign }) => {
  const {
    record,
    content,
    status: hookStatus,
    error: hookError,
    lastSaved,
    setContent,
    finalize,
    sign,
    cosign,
  } = useClinicalEvolution(initialRecord);

  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [retrospectiveReason, setRetrospectiveReason] = useState('');

  const isDraft = record?.status === 'draft';
  const isFinalized = record?.status === 'finalized';
  const isSigned = record?.status === 'signed';

  // Can the current user sign?
  const canSign = isFinalized && currentUserId === record?.nutritionist_id;
  const canCosignRecord = isSigned && canCosign && currentUserId === record?.supervisor_id;

  const color = RECORD_STATUS_COLORS[record?.status] || 'zinc';

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data } = await listEvolutionTemplates();
      if (data) setTemplates(data);
    };
    fetchTemplates();
  }, []);

  const template = templates.find((t) => t.code === record?.template_code);
  const sections = template?.sections || [];

  useEffect(() => {
    if (sections.length > 0 && !activeTab) {
      setActiveTab(sections[0].key);
    }
  }, [sections, activeTab]);

  const handleContentChange = (sectionKey, html) => {
    setContent((prev) => ({ ...prev, [sectionKey]: html }));
  };

  const handleFinalize = async () => {
    // If encounter is older than 5 min, we need retrospective reason
    const encounterDate = new Date(record.encounter_at);
    const isRetrospective = (new Date() - encounterDate) > 5 * 60 * 1000;
    
    if (isRetrospective && (!retrospectiveReason || retrospectiveReason.length < 10)) {
      return; // Handled by UI validation in dialog
    }

    const success = await finalize(isRetrospective ? retrospectiveReason : null);
    if (success) {
      setShowFinalizeDialog(false);
    }
  };

  const isValidToFinalize = isContentMinimallyValid(content);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex-none p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 -ml-2 text-zinc-500">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
                {template ? template.name : 'Evolução Clínica'}
              </h2>
              <Badge 
                variant="secondary" 
                className={`
                  ${color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                  ${color === 'blue' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : ''}
                  ${color === 'green' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}
                `}
              >
                {RECORD_STATUS_LABELS[record?.status]}
              </Badge>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Atendimento em {new Date(record?.encounter_at).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          {isDraft && <SaveStatusIndicator status={hookStatus} error={hookError} lastSaved={lastSaved} />}
          
          {isDraft && (
            <Button 
              onClick={() => setShowFinalizeDialog(true)} 
              disabled={!isValidToFinalize || hookStatus === 'finalizing' || hookStatus === 'saving'}
              className="w-full sm:w-auto"
            >
              <Lock className="w-4 h-4 mr-2" />
              Finalizar
            </Button>
          )}

          {canSign && (
            <Button 
              onClick={sign} 
              disabled={hookStatus === 'signing'}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileSignature className="w-4 h-4 mr-2" />
              Assinar Registro
            </Button>
          )}

          {canCosignRecord && (
            <Button 
              onClick={cosign} 
              disabled={hookStatus === 'signing'}
              variant="outline"
              className="w-full sm:w-auto border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Co-assinar (Supervisor)
            </Button>
          )}

          {!isDraft && (
            <Button
              variant="secondary"
              onClick={() => {
                exportEvolutionAsPdf({
                  record,
                  content,
                  sections,
                  templateName: template?.name,
                  patientName: record?.patient?.name || record?.patient_name || 'Paciente',
                  nutritionistName: record?.nutritionist?.name || record?.nutritionist_name || 'Profissional',
                });
              }}
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar PDF
            </Button>
          )}
        </div>
      </div>

      {hookError && hookStatus === 'error' && (
        <div className="px-4 pt-4 flex-none">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{hookError}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Sidebar Tabs */}
        {sections.length > 0 && (
          <div className="w-full md:w-64 flex-none border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1">
                {sections.map((section) => {
                  const hasContent = content[section.key]?.replace(/<[^>]*>?/gm, '').trim().length > 0;
                  return (
                    <button
                      key={section.key}
                      onClick={() => setActiveTab(section.key)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between group
                        ${activeTab === section.key 
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-medium' 
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-300'
                        }`}
                    >
                      <span className="truncate pr-2">{section.label}</span>
                      {hasContent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Possui conteúdo" />
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 min-h-[400px] md:min-h-0 bg-white dark:bg-zinc-950 relative">
          <ScrollArea className="h-full">
            <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
              {sections.length > 0 ? (
                sections.map((section) => (
                  <div 
                    key={section.key} 
                    className={activeTab === section.key ? 'block' : 'hidden'}
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        {section.label}
                        {section.required && <span className="text-red-500 text-sm font-normal">*</span>}
                      </h3>
                      {section.hint && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                          {section.hint}
                        </p>
                      )}
                    </div>
                    
                    <RichTextEditor
                      value={content[section.key] || ''}
                      onChange={(html) => handleContentChange(section.key, html)}
                      placeholder={`Digite aqui o conteúdo para ${section.label.toLowerCase()}...`}
                      disabled={!isDraft}
                      minHeight="min-h-[300px]"
                    />
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-zinc-500">
                  <p>Nenhum template selecionado ou o template não possui seções definidas.</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Read Only Overlay for Signed/Finalized */}
          {!isDraft && (
            <div className="absolute top-4 right-4 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-center gap-2 opacity-80 pointer-events-none">
              <Lock className="w-4 h-4 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Modo Leitura</span>
            </div>
          )}
        </div>
      </div>

      {/* Finalize Dialog */}
      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Registro Clínico</DialogTitle>
            <DialogDescription>
              Ao finalizar, o conteúdo não poderá mais ser alterado. Você precisará assinar o registro em seguida para torná-lo um documento oficial.
            </DialogDescription>
          </DialogHeader>

          {/* Retrospective reason if encounter is older than 5 min */}
          {record && (new Date() - new Date(record.encounter_at)) > 5 * 60 * 1000 && (
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Motivo do registro retroativo <span className="text-red-500">*</span>
              </label>
              <Textarea 
                placeholder="Ex: Registro realizado após a consulta devido a queda de energia."
                value={retrospectiveReason}
                onChange={(e) => setRetrospectiveReason(e.target.value)}
                rows={3}
              />
              {retrospectiveReason.length > 0 && retrospectiveReason.length < 10 && (
                <p className="text-xs text-red-500">Mínimo de 10 caracteres necessários.</p>
              )}
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)} disabled={hookStatus === 'finalizing'}>
              Cancelar
            </Button>
            <Button 
              onClick={handleFinalize} 
              disabled={
                hookStatus === 'finalizing' || 
                ((new Date() - new Date(record?.encounter_at)) > 5 * 60 * 1000 && retrospectiveReason.length < 10)
              }
            >
              {hookStatus === 'finalizing' ? 'Finalizando...' : 'Finalizar Registro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EvolutionEditor;
