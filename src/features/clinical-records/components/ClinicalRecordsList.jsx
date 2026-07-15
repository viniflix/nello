import React, { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, ChevronRight, FileText, Filter, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RECORD_STATUS_COLORS, RECORD_STATUS_LABELS } from '../model/evolutionSchema';
import { recordDisplayStatus } from '../model/amendmentSchema';

const formatDateTime = (dateString) => {
  if (!dateString) return '';
  return format(parseISO(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
};

const statusClasses = (color) => `
  ${color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
  ${color === 'blue' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : ''}
  ${color === 'green' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}
  ${color === 'orange' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' : ''}
  ${color === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : ''}
  ${color === 'zinc' ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400' : ''}
`;

const RecordButton = ({ record, onSelectRecord, historical = false }) => {
  const color = RECORD_STATUS_COLORS[record.status] || 'zinc';
  return (
    <div
      data-testid={historical ? 'historical-record-row' : undefined}
      data-record-id={historical ? record.id : undefined}
      className={historical ? 'ml-5 border-l pl-3' : undefined}
    >
      <button
        type="button"
        onClick={() => onSelectRecord(record)}
        aria-label={`Abrir evolução de ${formatDateTime(record.encounter_at)}`}
        className="group w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Card className="overflow-hidden transition-colors group-hover:border-zinc-300 dark:group-hover:border-zinc-700">
          <CardContent className="p-0">
            <div className="flex items-center p-4">
              <div className="min-w-0 flex-1 pr-4">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="secondary" className={statusClasses(color)}>
                    {recordDisplayStatus(record)}
                  </Badge>
                  <span className="text-xs font-medium capitalize text-zinc-500 dark:text-zinc-400">
                    {record.record_type?.replace('_', ' ')}
                  </span>
                  {record.student_id ? (
                    <Badge variant="outline" className="border-blue-200 text-[10px] uppercase text-blue-600 dark:border-blue-900 dark:text-blue-400">
                      Estudante
                    </Badge>
                  ) : null}
                </div>
                <h4 className="truncate text-base font-medium text-zinc-900 dark:text-zinc-100">
                  Atendimento em {formatDateTime(record.encounter_at)}
                </h4>
                <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {record.template_code
                    ? `Template: ${record.template_code.replace(/_/g, ' ')}`
                    : 'Sem template'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-900 dark:group-hover:text-zinc-100" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
      </button>
    </div>
  );
};

const groupRecordChains = (records) => {
  const groups = new Map();
  records.forEach((record) => {
    const rootId = record.root_record_id || record.id;
    const group = groups.get(rootId) || [];
    group.push(record);
    groups.set(rootId, group);
  });

  return [...groups.entries()].map(([rootId, versions]) => {
    const ordered = [...versions].sort(
      (left, right) => Number(right.chain_version || 0) - Number(left.chain_version || 0),
    );
    const primary = ordered.find((record) => record.status === 'signed') || ordered[0];
    return {
      rootId,
      versions: ordered,
      primary,
      historical: ordered.filter((record) => record.id !== primary.id),
    };
  }).sort((left, right) => (
    new Date(right.primary.encounter_at || 0).getTime() - new Date(left.primary.encounter_at || 0).getTime()
  ));
};

const ClinicalRecordsList = ({ records, onSelectRecord, onCreateDraft, canWriteEpisode }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedRoots, setExpandedRoots] = useState(() => new Set());

  const recordChains = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    const recordMatches = (record) => {
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      const matchesSearch = !searchTerm || (
        recordDisplayStatus(record).toLowerCase().includes(normalizedSearch)
        || record.record_type?.toLowerCase().includes(normalizedSearch)
      );
      return matchesStatus && matchesSearch;
    };
    return groupRecordChains(records || []).filter(
      ({ versions }) => versions.some(recordMatches),
    );
  }, [records, searchTerm, statusFilter]);

  const toggleChain = (rootId) => {
    setExpandedRoots((previous) => {
      const next = new Set(previous);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Buscar registros clínicos"
              placeholder="Buscar registros..."
              className="bg-white pl-9 dark:bg-zinc-900"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="relative">
            <select
              aria-label="Filtrar por status"
              className="h-10 appearance-none rounded-md border border-zinc-200 bg-white px-3 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:ring-zinc-300"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Todos os status</option>
              {Object.entries(RECORD_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" aria-hidden="true" />
          </div>
        </div>

        {canWriteEpisode ? (
          <Button onClick={onCreateDraft} className="w-full sm:w-auto">
            <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            Nova Evolução
          </Button>
        ) : null}
      </div>

      {recordChains.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-12 text-center dark:border-zinc-800">
          <FileText className="mx-auto mb-3 h-12 w-12 text-zinc-300 dark:text-zinc-700" aria-hidden="true" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Nenhum registro encontrado</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {searchTerm || statusFilter !== 'all'
              ? 'Tente ajustar os filtros de busca.'
              : 'Este episódio de cuidado ainda não possui evoluções ou registros clínicos.'}
          </p>
          {canWriteEpisode && !searchTerm && statusFilter === 'all' ? (
            <Button variant="outline" onClick={onCreateDraft} className="mt-4">
              Criar primeira evolução
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {recordChains.map(({ rootId, primary, historical }) => (
            <section key={rootId} aria-label={`Cadeia do registro ${rootId}`} className="space-y-2">
              <RecordButton record={primary} onSelectRecord={onSelectRecord} />
              {historical.length > 0 ? (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => toggleChain(rootId)}>
                    <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${expandedRoots.has(rootId) ? 'rotate-180' : ''}`} aria-hidden="true" />
                    {expandedRoots.has(rootId) ? 'Ocultar' : 'Mostrar'} {historical.length}{' '}
                    {historical.length === 1 ? 'versão anterior' : 'versões anteriores'}
                  </Button>
                  {expandedRoots.has(rootId) ? (
                    <div className="space-y-2">
                      {historical.map((record) => (
                        <RecordButton key={record.id} record={record} onSelectRecord={onSelectRecord} historical />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClinicalRecordsList;
