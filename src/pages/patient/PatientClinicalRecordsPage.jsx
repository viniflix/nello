import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, FileClock, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPatientRecordFoundation } from '@/features/clinical-records/api/record-foundation-queries';
import { listClinicalRecordVersionChain } from '@/features/clinical-records/api/amendment-queries';
import { getMeaningfulClinicalText } from '@/features/clinical-records/model/evolutionSchema';

const TYPE_LABELS = {
  clinical_evolution: 'Evolução clínica',
  initial_assessment: 'Avaliação inicial',
  follow_up: 'Acompanhamento clínico',
  intercurrence: 'Intercorrência',
};

const isShared = (record) => record?.visibility === 'shared_with_patient';
const isOfficial = (record) => {
  if (record?.status === 'signed') return true;
  if (record?.status === 'corrected') {
    return record?.amendment?.status === 'effective' && record?.amendment?.type === 'correction';
  }
  if (record?.status === 'invalidated') {
    return record?.amendment?.status === 'effective' && record?.amendment?.type === 'invalidation';
  }
  return false;
};
const safeSharedRecords = (records) => (Array.isArray(records) ? records : [])
  .filter(isShared)
  .filter(isOfficial)
  .sort((left, right) => (right.chain_version || 0) - (left.chain_version || 0));

const currentSharedRecords = (records) => {
  const roots = new Set();
  return safeSharedRecords(records).filter((record) => {
    const root = record.root_record_id || record.id;
    if (roots.has(root)) return false;
    roots.add(root);
    return true;
  });
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(date);
};

const getSections = (record) => {
  const content = record?.content && typeof record.content === 'object' ? record.content : {};
  const snapshot = Array.isArray(record?.template_sections_snapshot)
    ? record.template_sections_snapshot.filter((section) => section?.key && section?.label)
    : [];
  if (snapshot.length) {
    return snapshot
      .map((section) => ({ label: section.label, text: getMeaningfulClinicalText(content[section.key]) }))
      .filter((section) => section.text);
  }
  const text = Object.values(content).map(getMeaningfulClinicalText).filter(Boolean).join('\n\n');
  return text ? [{ label: 'Informações do registro', text }] : [];
};

function RecordVersion({ record, current }) {
  const amendment = record.amendment?.status === 'effective' ? record.amendment : null;
  const invalidated = record.status === 'invalidated';
  const previous = !current && record.status === 'corrected';
  const sections = getSections(record);

  return (
    <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Versão {record.chain_version || 1}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{TYPE_LABELS[record.record_type] || 'Registro clínico'}</h3>
          <p className="mt-1 text-sm text-slate-500">Atendimento em {formatDate(record.encounter_at || record.recorded_at)}</p>
        </div>
        <Badge variant="secondary" className={invalidated ? 'bg-red-100 text-red-700' : previous ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>
          {invalidated ? 'Invalidado' : previous ? 'Substituído' : 'Versão atual'}
        </Badge>
      </div>

      {invalidated && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Este registro foi invalidado pelo profissional responsável. Ele permanece preservado no histórico, mas não representa uma orientação clínica vigente.
        </div>
      )}

      {sections.length ? sections.map((section) => (
        <section key={section.label}>
          <h4 className="text-sm font-semibold text-slate-700">{section.label}</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{section.text}</p>
        </section>
      )) : <p className="text-sm text-slate-500">Este registro não possui conteúdo textual compartilhado.</p>}

      {amendment && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Atualização do registro</p>
          <p className="mt-1"><span className="font-medium">Motivo:</span> {amendment.reason}</p>
          <p className="mt-1"><span className="font-medium">Data:</span> {formatDate(amendment.effective_at || amendment.created_at)}</p>
          <p className="mt-1"><span className="font-medium">Responsável:</span> {record.professional_display_name || 'profissional responsável pelo atendimento'}</p>
        </div>
      )}
    </article>
  );
}

export default function PatientClinicalRecordsPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [chain, setChain] = useState([]);
  const [chainState, setChainState] = useState('idle');
  const mountedRef = useRef(false);
  const foundationRequestRef = useRef(0);
  const chainRequestRef = useRef(0);
  const currentUserIdRef = useRef(user?.id);
  currentUserIdRef.current = user?.id;

  const loadRecords = useCallback(async () => {
    if (!user?.id) return;
    const requestId = ++foundationRequestRef.current;
    const requestedUserId = user.id;
    setLoading(true);
    setError(false);
    setSelected(null);
    setChain([]);
    setChainState('idle');
    const { data, error: requestError } = await getPatientRecordFoundation(user.id);
    if (!mountedRef.current || requestId !== foundationRequestRef.current || requestedUserId !== currentUserIdRef.current) return;
    if (requestError) {
      setRecords([]);
      setError(true);
    } else {
      setRecords(currentSharedRecords(data?.records));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    loadRecords();
    return () => {
      mountedRef.current = false;
      foundationRequestRef.current += 1;
      chainRequestRef.current += 1;
    };
  }, [loadRecords]);

  const openRecord = async (record) => {
    const requestId = ++chainRequestRef.current;
    const requestedUserId = user?.id;
    setSelected(record);
    setChainState('loading');
    setChain([]);
    const { data, error: requestError } = await listClinicalRecordVersionChain(record.id);
    if (!mountedRef.current || requestId !== chainRequestRef.current || requestedUserId !== currentUserIdRef.current) return;
    if (requestError) {
      setChainState('error');
      return;
    }
    setChain(safeSharedRecords(data));
    setChainState('success');
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-700"><FileClock className="h-6 w-6" aria-hidden="true" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Registros clínicos</h1>
              <p className="mt-1 text-sm text-slate-600">Consulte registros que sua equipe de cuidado compartilhou com você.</p>
            </div>
          </div>
        </header>

        {loading && (
          <div role="status" aria-label="Carregando registros clínicos" className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-slate-200" />)}
          </div>
        )}

        {!loading && error && (
          <Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
            <p className="font-medium text-slate-900">Não foi possível carregar seus registros clínicos.</p>
            <p className="text-sm text-slate-500">Tente novamente. Nenhuma informação foi alterada.</p>
            <Button variant="outline" onClick={loadRecords}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
          </CardContent></Card>
        )}

        {!loading && !error && records.length === 0 && (
          <Card><CardContent className="py-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
            <p className="mt-4 font-medium text-slate-900">Nenhum registro clínico compartilhado até agora.</p>
            <p className="mt-1 text-sm text-slate-500">Quando houver um registro disponível para você, ele aparecerá aqui.</p>
          </CardContent></Card>
        )}

        {!loading && !error && records.length > 0 && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
            <section aria-labelledby="records-list-title">
              <h2 id="records-list-title" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Compartilhados com você</h2>
              <div className="space-y-3">
                {records.map((record) => (
                  <button key={record.id} type="button" onClick={() => openRecord(record)} aria-label={`Abrir ${TYPE_LABELS[record.record_type] || 'registro clínico'}`} className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <Card className={selected?.id === record.id ? 'border-blue-400 shadow-sm' : 'transition-shadow hover:shadow-sm'}>
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div><p className="font-semibold text-slate-900">{TYPE_LABELS[record.record_type] || 'Registro clínico'}</p><p className="mt-1 text-xs text-slate-500">{formatDate(record.encounter_at || record.recorded_at)}</p></div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            </section>

            <section aria-live="polite" aria-labelledby="record-detail-title">
              <h2 id="record-detail-title" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Detalhes e histórico</h2>
              {!selected && <Card><CardContent className="py-12 text-center text-sm text-slate-500">Selecione um registro para consultar os detalhes.</CardContent></Card>}
              {chainState === 'loading' && <div role="status" className="h-48 animate-pulse rounded-xl bg-slate-200"><span className="sr-only">Carregando histórico</span></div>}
              {chainState === 'error' && <Card><CardContent className="space-y-3 py-8 text-center"><p>Não foi possível abrir o histórico deste registro.</p><Button variant="outline" onClick={() => openRecord(selected)}>Tentar novamente</Button></CardContent></Card>}
              {chainState === 'success' && chain.length > 0 && (
                <div className="space-y-6">
                  <RecordVersion record={chain[0]} current />
                  {chain.length > 1 && <div className="space-y-3"><h3 className="text-base font-semibold text-slate-900">Histórico de versões</h3>{chain.slice(1).map((record) => <RecordVersion key={record.id} record={record} />)}</div>}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
