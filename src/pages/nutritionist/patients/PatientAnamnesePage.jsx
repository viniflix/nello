import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { useAnamnesisRunner } from '@/hooks/useAnamnesisRunner';
import { useAnamnesisTemplates } from '@/hooks/useAnamnesisTemplates';
import { usePatientHub } from '@/hooks/usePatientHub';
import { SimpleListSkeleton, PageHeaderSkeleton, TimelineSkeleton } from '@/components/ui/custom-skeletons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { patientAnamnesisEditRoute } from '@/lib/utils/patientRoutes';
import TimelineFeed from '@/features/clinical-records/components/TimelineFeed';
import { getPatientRecordFoundation } from '@/features/clinical-records/api/record-foundation-queries';

export default function PatientAnamnesePage() {
  const navigate = useNavigate();
  const { patientId, paramValue, loading: resolvingPatient, error: patientResolutionError } = useResolvedPatientId();
  const { createRecord } = useAnamnesisRunner(patientId);
  const { useTemplates } = useAnamnesisTemplates();
  const { data: templates, isLoading: loadingTemplates } = useTemplates();
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const { patientData } = usePatientHub(patientId);

  const getTemplateScore = React.useCallback((template) => {
    if (!patientData) return 0;
    const title = (template.title || '').toLowerCase();
    const gender = patientData.gender;
    let age = null;
    if (patientData.birth_date) {
      const birth = new Date(patientData.birth_date);
      if (!isNaN(birth.getTime())) {
         age = new Date().getFullYear() - birth.getFullYear();
      }
    }
    
    let score = 0;
    if (gender === 'F' && (title.includes('mulher') || title.includes('feminin'))) score += 10;
    if (gender === 'M' && (title.includes('homem') || title.includes('masculin'))) score += 10;
    if (age !== null && age < 18 && (title.includes('criança') || title.includes('infantil') || title.includes('pediatria'))) score += 10;
    if (age !== null && age >= 60 && (title.includes('idoso') || title.includes('geriatria'))) score += 10;
    if (age !== null && age >= 18 && age < 60 && title.includes('adulto')) score += 5;
    
    return score;
  }, [patientData]);

  const sortedTemplates = React.useMemo(() => {
    if (!templates) return [];
    return [...templates].sort((a, b) => getTemplateScore(b) - getTemplateScore(a));
  }, [templates, getTemplateScore]);

  const foundationQuery = useQuery({
    queryKey: ['patientRecordFoundation', patientId],
    queryFn: async () => {
      const result = await getPatientRecordFoundation(patientId);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: Boolean(patientId && !resolvingPatient && !patientResolutionError),
  });

  const viewedEpisodeId = foundationQuery.data?.viewed_episode_id || null;
  const writableEpisodeId = foundationQuery.data?.writable_episode_id || null;
  const canWriteDisplayedEpisode = Boolean(
    foundationQuery.data?.can_write
    && writableEpisodeId
    && writableEpisodeId === viewedEpisodeId,
  );
  const contextKey = `${patientId || ''}|${paramValue || ''}|${viewedEpisodeId || ''}|${writableEpisodeId || ''}`;
  const activeContextRef = useRef(contextKey);
  activeContextRef.current = contextKey;
  useEffect(() => () => { activeContextRef.current = null; }, []);

  const handleCreateNew = async (templateId) => {
    if (!canWriteDisplayedEpisode) return;
    const creationContext = contextKey;
    setIsTemplateModalOpen(false);
    const record = await createRecord.mutateAsync({ templateId, episodeId: writableEpisodeId });
    if (activeContextRef.current !== creationContext) return;
    navigate(patientAnamnesisEditRoute({ slug: paramValue }, record.id));
  };

  if (resolvingPatient || (!patientResolutionError && foundationQuery.isLoading)) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">
        <PageHeaderSkeleton />
        <TimelineSkeleton count={3} />
      </div>
    );
  }

  if (patientResolutionError || !patientId) {
    return (
      <div role="alert" className="max-w-5xl mx-auto p-4 md:p-6 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
        Não foi possível identificar o paciente desta página. Volte à lista de pacientes e tente novamente.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/nutritionist/patients/${paramValue}/hub`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />Voltar ao Hub
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Prontuário & Histórico</h2>
            <p className="text-sm text-slate-500">Linha do tempo do episódio de atendimento selecionado.</p>
          </div>
        </div>
        <div className="text-right">
          <Button
            onClick={() => setIsTemplateModalOpen(true)}
            disabled={!canWriteDisplayedEpisode}
            aria-describedby={!canWriteDisplayedEpisode ? 'anamnesis-write-restriction' : undefined}
            className="gap-2 bg-[#5f6f52] hover:bg-[#4a5740]"
          >
            <Plus className="w-4 h-4" />Nova Anamnese
          </Button>
          {!canWriteDisplayedEpisode && (
            <p id="anamnesis-write-restriction" className="mt-1 max-w-56 text-xs text-slate-500">
              Este episódio está disponível somente para consulta.
            </p>
          )}
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 md:p-6 mb-8">
        {foundationQuery.error ? (
          <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm space-y-3">
            <p>Não foi possível determinar o episódio deste atendimento.</p>
            <Button variant="outline" size="sm" onClick={() => foundationQuery.refetch()}>Tentar novamente</Button>
          </div>
        ) : (
          <TimelineFeed patientId={patientId} viewedEpisodeId={viewedEpisodeId} patientSlug={paramValue} />
        )}
      </div>

      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolha um Formulário</DialogTitle>
            <DialogDescription>Selecione qual formulário deseja preencher para este paciente.</DialogDescription>
          </DialogHeader>
          {loadingTemplates ? <div className="py-8"><SimpleListSkeleton /></div> : (
            <div className="space-y-3 mt-4 max-h-[60vh] overflow-y-auto pr-2">
              {sortedTemplates?.map((template) => {
                const isRecommended = getTemplateScore(template) >= 5;
                return (
                <button key={template.id} type="button" onClick={() => handleCreateNew(template.id)} className="w-full p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span>
                    <span className="font-semibold text-slate-800 flex items-center gap-2">
                      {template.title}
                      {isRecommended && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">⭐ Recomendado</Badge>}
                      {template.is_system_default && !isRecommended && <Badge variant="secondary" className="text-[10px]">Global</Badge>}
                    </span>
                    <span className="block text-xs text-slate-500 mt-1 line-clamp-1">{template.description || 'Sem descrição'}</span>
                  </span>
                  <Plus className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
