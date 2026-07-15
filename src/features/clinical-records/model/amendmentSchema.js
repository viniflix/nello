import { getMeaningfulClinicalText } from './evolutionSchema';

export const AMENDMENT_STATUS_LABELS = {
  draft: 'Correção em andamento',
  effective: 'Efetivada',
  abandoned: 'Abandonada',
  signed: 'Assinado',
  corrected: 'Corrigido',
  invalidated: 'Invalidado',
};

export const recordDisplayStatus = (record) => {
  if (!record?.status) return 'Status indisponível';

  if (
    record.status === 'signed'
    && record.amendment?.type === 'correction'
    && record.amendment.status === 'draft'
  ) {
    return AMENDMENT_STATUS_LABELS.draft;
  }

  return AMENDMENT_STATUS_LABELS[record.status] || record.status;
};

export const normalizeImpact = (data) => {
  const knownReferences = Array.isArray(data?.known_references)
    ? data.known_references
    : [];
  const parsedChainVersion = Number(data?.chain_version);

  return {
    recordId: data?.record_id || null,
    rootRecordId: data?.root_record_id || null,
    chainVersion: Number.isFinite(parsedChainVersion) ? parsedChainVersion : null,
    careEpisodeId: data?.care_episode_id || null,
    episodeStatus: data?.episode_status || null,
    visibility: data?.visibility || null,
    currentStatus: data?.current_status || null,
    hasPatientNotice: data?.has_patient_notice === true,
    knownReferences,
    knownReferenceCount: knownReferences.length,
    impactHash: data?.impact_hash || null,
  };
};

const normalizeSectionValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && getMeaningfulClinicalText(value).length === 0) return null;
  return value;
};

const sectionValuesMatch = (left, right) => {
  if (Object.is(left, right)) return true;
  if (typeof left === 'object' && typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
};

export const compareSectionValues = (left, right) => {
  const normalizedLeft = normalizeSectionValue(left);
  const normalizedRight = normalizeSectionValue(right);

  if (sectionValuesMatch(normalizedLeft, normalizedRight)) return 'unchanged';
  if (normalizedLeft === null) return 'added';
  if (normalizedRight === null) return 'removed';
  return 'changed';
};
