import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const getAmendmentStatus = (record) => record?.amendment?.status || record?.amendment_status;
const getAmendmentType = (record) => record?.amendment?.type || record?.amendment_type;

const getVersionState = (record, currentRecordId) => {
  if (getAmendmentStatus(record) === 'abandoned') return 'Rascunho abandonado';
  if (getAmendmentType(record) === 'correction' && getAmendmentStatus(record) === 'draft') {
    return 'Correção em preparação';
  }
  if (record.status === 'invalidated') return 'Invalidado';
  if (record.id === currentRecordId && record.status === 'signed') return 'Vigente';
  return 'Substituído';
};

const ClinicalRecordVersionHistory = ({ chain = [], onSelectRecord, onCompare }) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const orderedChain = useMemo(
    () => [...chain].sort((left, right) => Number(right.chain_version || 0) - Number(left.chain_version || 0)),
    [chain],
  );
  const rootIdentity = orderedChain[0]?.root_record_id
    || orderedChain[0]?.rootRecordId
    || orderedChain.map((record) => record.id).sort().join(':');
  const previousRootRef = useRef(rootIdentity);
  const currentRecord = orderedChain.find((record) => (
    record.status === 'signed' && getAmendmentStatus(record) !== 'abandoned'
  ));

  useEffect(() => {
    const validIds = new Set(orderedChain.map((record) => record.id));
    setSelectedIds((previous) => {
      const next = previousRootRef.current === rootIdentity
        ? previous.filter((id) => validIds.has(id))
        : [];
      return next.length === previous.length && next.every((id, index) => id === previous[index])
        ? previous
        : next;
    });
    previousRootRef.current = rootIdentity;
  }, [orderedChain, rootIdentity]);

  const toggleSelection = (recordId) => {
    setSelectedIds((previous) => {
      if (previous.includes(recordId)) return previous.filter((id) => id !== recordId);
      return previous.length >= 2 ? [previous[1], recordId] : [...previous, recordId];
    });
  };

  return (
    <section aria-labelledby="clinical-version-history-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="clinical-version-history-title" className="font-semibold">Histórico de versões</h3>
        {onCompare ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selectedIds.length !== 2}
            onClick={() => onCompare(selectedIds[0], selectedIds[1])}
          >
            Comparar versões selecionadas
          </Button>
        ) : null}
      </div>
      <ol className="space-y-2">
        {orderedChain.map((record) => {
          const version = Number(record.chain_version || 0);
          const state = getVersionState(record, currentRecord?.id);
          return (
            <li
              key={record.id}
              data-testid="version-row"
              data-record-id={record.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              {onCompare ? (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(record.id)}
                  onChange={() => toggleSelection(record.id)}
                  aria-label={`Selecionar versão ${version} para comparação`}
                />
              ) : null}
              <button
                type="button"
                className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelectRecord?.(record)}
                aria-label={`Abrir versão ${version}, ${state}`}
              >
                <span className="font-medium">Versão {version}</span>
              </button>
              <Badge variant={state === 'Vigente' ? 'default' : 'secondary'}>{state}</Badge>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default ClinicalRecordVersionHistory;
