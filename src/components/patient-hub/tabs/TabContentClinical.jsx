import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Droplet, FileEdit, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { HubPanel } from '@/components/patient-hub/HubPanel';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { useToast } from '@/components/ui/use-toast';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';
import { getRecentLabResults } from '@/lib/supabase/lab-results-queries';
import GlycemiaSummaryCard from '@/components/patient-hub/GlycemiaSummaryCard';
import ClinicalRecordsList from '@/features/clinical-records/components/ClinicalRecordsList';
import EvolutionEditor from '@/features/clinical-records/components/EvolutionEditor';
import EvolutionTemplateSelector from '@/features/clinical-records/components/EvolutionTemplateSelector';
import { createClinicalEvolutionDraft, listClinicalRecordsByEpisode } from '@/features/clinical-records/api/evolution-queries';
import ClinicalAttachmentsPanel from '@/features/clinical-records/components/ClinicalAttachmentsPanel';

const formatDate = value => value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString('pt-BR')
    : 'Data não informada';

const labStatus = status => ({ normal: 'Normal', low: 'Baixo', high: 'Alto' }[status] || 'Pendente');

export default function TabContentClinical({ patientId, patientData, viewedEpisodeId, writableEpisodeId, currentUserId, canCosign }) {
    const patient = patientData || { id: patientId };
    const navigate = useNavigate();
    const { toast } = useToast();
    const [anamnesis, setAnamnesis] = useState(null);
    const [anamnesisState, setAnamnesisState] = useState('loading');
    const [labs, setLabs] = useState([]);
    const [labsState, setLabsState] = useState('loading');
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(true);
    const [recordsError, setRecordsError] = useState(null);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);
    const recordsRequestRef = useRef(0);
    const creationRequestRef = useRef(0);

    const loadSummary = useCallback(async () => {
        if (!patientId) {
            setAnamnesisState('ready');
            setLabsState('ready');
            return;
        }
        setAnamnesisState('loading');
        setLabsState('loading');
        const [anamnesisResult, labsResult] = await Promise.allSettled([
            getLatestAnamnesis(patientId),
            getRecentLabResults(patientId)
        ]);
        if (anamnesisResult.status === 'fulfilled' && !anamnesisResult.value?.error) {
            setAnamnesis(anamnesisResult.value?.data || null);
            setAnamnesisState('ready');
        } else {
            setAnamnesis(null);
            setAnamnesisState('error');
        }
        if (labsResult.status === 'fulfilled' && !labsResult.value?.error) {
            setLabs(labsResult.value?.data || []);
            setLabsState('ready');
        } else {
            setLabs([]);
            setLabsState('error');
        }
    }, [patientId]);

    const loadRecords = useCallback(async () => {
        const requestId = ++recordsRequestRef.current;
        setRecords([]);
        setRecordsError(null);
        if (!patientId || !viewedEpisodeId) {
            setRecordsLoading(false);
            return;
        }
        setRecordsLoading(true);
        const { data, error } = await listClinicalRecordsByEpisode(patientId, viewedEpisodeId);
        if (requestId !== recordsRequestRef.current) return;
        if (error) setRecordsError(error.message || 'Falha ao carregar evoluções.');
        else {
            const nextRecords = data || [];
            setRecords(nextRecords);
            setSelectedRecord(previous => previous ? nextRecords.find(candidate => candidate.id === previous.id) || null : previous);
        }
        setRecordsLoading(false);
    }, [patientId, viewedEpisodeId]);

    useEffect(() => {
        void loadSummary();
        setSelectedRecord(null);
        setShowTemplateSelector(false);
        void loadRecords();
        return () => { recordsRequestRef.current += 1; };
    }, [loadRecords, loadSummary]);

    useEffect(() => () => { creationRequestRef.current += 1; }, [patientId, writableEpisodeId]);

    const createDraft = async ({ template, encounterAt, visibility, retrospectiveReason }) => {
        if (!patientId || !writableEpisodeId) return false;
        const requestId = ++creationRequestRef.current;
        const { data, error } = await createClinicalEvolutionDraft(patientId, writableEpisodeId, template.code, encounterAt, visibility, retrospectiveReason || null);
        if (requestId !== creationRequestRef.current) return false;
        if (error || !data) {
            toast({ title: 'Erro ao criar evolução', description: error?.message || 'Não foi possível criar o rascunho.', variant: 'destructive' });
            return false;
        }
        setSelectedRecord(data);
        return true;
    };

    if (selectedRecord) {
        return <div className="h-[700px]"><EvolutionEditor
            initialRecord={selectedRecord}
            onBack={() => { setSelectedRecord(null); void loadRecords(); }}
            currentUserId={currentUserId}
            canCosign={canCosign}
            onReplacementOpen={setSelectedRecord}
            onRecordsRefresh={loadRecords}
        /></div>;
    }

    const recentLabs = labs.slice(0, 3);
    const isDiabetic = patient?.preferences?.is_diabetic === true;

    return <div className="space-y-4">
        <div className={`grid grid-cols-1 items-start gap-4 ${isDiabetic ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            <HubPanel
                title="Anamnese"
                description="Histórico clínico e informações essenciais"
                action={<Button size="sm" variant={anamnesis ? 'outline' : 'default'} onClick={() => navigate(patientRoute(patient, 'anamnesis'))}>{anamnesis ? 'Abrir' : 'Iniciar'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>}
            >
                {anamnesisState === 'loading' ? <div role="status" aria-label="Carregando anamnese" className="space-y-3"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-14 w-full" /></div>
                    : anamnesisState === 'error' ? <div className="space-y-3"><p className="text-sm text-slate-600">Não foi possível carregar a anamnese.</p><Button size="sm" variant="outline" onClick={() => void loadSummary()}>Recarregar</Button></div>
                        : !anamnesis ? <p className="text-sm leading-relaxed text-muted-foreground">Histórico clínico ainda não registrado.</p>
                            : <div className="space-y-3"><div className="rounded-lg border border-[#d8d5d0] bg-[#efeeec] p-3 shadow-inner"><p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Documento</p><p className="mt-1 break-words text-[13px] font-semibold text-slate-800">{anamnesis.template?.title || 'Anamnese nutricional'}</p></div><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Registrada em {formatDate(anamnesis.date)}</span><Badge variant="outline" className="font-medium">{anamnesis.status === 'completed' ? 'Completa' : 'Rascunho'}</Badge></div></div>}
            </HubPanel>

            <HubPanel
                title="Exames laboratoriais"
                description="Resultados recentes e pontos de atenção"
                action={<Button size="sm" variant="outline" onClick={() => navigate(patientRoute(patient, 'lab-results'))}>{labs.length ? 'Abrir exames' : 'Adicionar'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>}
            >
                {labsState === 'loading' ? <div role="status" aria-label="Carregando exames" className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                    : labsState === 'error' ? <div className="space-y-3"><p className="text-sm text-slate-600">Não foi possível carregar os exames.</p><Button size="sm" variant="outline" onClick={() => void loadSummary()}>Recarregar</Button></div>
                        : recentLabs.length === 0 ? <p className="text-sm leading-relaxed text-muted-foreground">Nenhum resultado laboratorial foi registrado.</p>
                            : <ul className="divide-y divide-slate-100">{recentLabs.map(test => <li key={test.id} className="flex min-w-0 items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-slate-800">{test.test_name}</p><p className="mt-0.5 text-xs text-slate-500">{test.test_value} {test.test_unit || ''}</p></div><span className="shrink-0 text-[11px] font-medium text-slate-600">{labStatus(test.status)}</span></li>)}</ul>}
            </HubPanel>

            {isDiabetic && <GlycemiaSummaryCard patientId={patientId} patient={patient} />}
        </div>

        <HubPanel title="Ações clínicas" description="Atalhos para os registros mais usados">
            <div className={`grid gap-2 ${writableEpisodeId ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {writableEpisodeId && <Button size="sm" onClick={() => setShowTemplateSelector(true)} className="min-w-0 gap-1.5 px-2 text-xs"><FileEdit className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Evolução</span></Button>}
                <Button variant="outline" size="sm" onClick={() => navigate(patientRoute(patient, 'lab-results'))} className="min-w-0 gap-1.5 px-2 text-xs"><Droplet className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Exame</span></Button>
                <Button variant="outline" size="sm" onClick={() => navigate(patientRoute(patient, 'anamnesis'))} className="min-w-0 gap-1.5 px-2 text-xs"><Plus className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Anamnese</span></Button>
            </div>
        </HubPanel>

        <section className="space-y-3" aria-labelledby="clinical-evolutions-title">
            <div><h3 id="clinical-evolutions-title" className="font-heading text-lg font-semibold leading-snug text-slate-900">Evoluções clínicas</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Registros do episódio de cuidado atual</p></div>
            {recordsLoading ? <div role="status" aria-label="Carregando evoluções" className="space-y-3 rounded-xl border border-[#d8d5d0] bg-white p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                : recordsError ? <Alert variant="destructive"><div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><span>Não foi possível carregar as evoluções. {recordsError}</span><Button type="button" variant="outline" size="sm" onClick={() => void loadRecords()}>Tentar novamente</Button></div></Alert>
                    : <ClinicalRecordsList records={records} onSelectRecord={setSelectedRecord} onCreateDraft={() => setShowTemplateSelector(true)} canWriteEpisode={Boolean(writableEpisodeId)} />}
        </section>

        {viewedEpisodeId && <ClinicalAttachmentsPanel patientId={patientId} episodeId={viewedEpisodeId} canUpload={Boolean(writableEpisodeId)} />}

        <EvolutionTemplateSelector open={showTemplateSelector} onOpenChange={setShowTemplateSelector} onSelectTemplate={createDraft} />
    </div>;
}
