const toTimestamp = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export const sortNewestFirst = (items, dateKey) => [...(Array.isArray(items) ? items : [])]
  .sort((left, right) => toTimestamp(right?.[dateKey]) - toTimestamp(left?.[dateKey]));

const isOfficialSharedRecord = (record) => {
  if (record?.visibility !== 'shared_with_patient') return false;
  if (record.status === 'signed') return true;
  if (record.status === 'corrected') {
    return record.amendment?.type === 'correction' && record.amendment?.status === 'effective';
  }
  if (record.status === 'invalidated') {
    return record.amendment?.type === 'invalidation' && record.amendment?.status === 'effective';
  }
  return false;
};

const hasStructuredValue = (value) => {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

export const hasMeasurementData = (record) => [
  record?.height,
  record?.head_circumference,
  record?.circumferences,
  record?.skinfolds,
  record?.bioimpedance,
  record?.bone_diameters,
].some(hasStructuredValue);

export const getCurrentSharedClinicalRecords = (records) => {
  const seenRoots = new Set();
  const currentRoots = [...(Array.isArray(records) ? records : [])]
    .filter(isOfficialSharedRecord)
    .sort((left, right) => (right.chain_version || 0) - (left.chain_version || 0))
    .filter((record) => {
      const root = record.root_record_id || record.id;
      if (seenRoots.has(root)) return false;
      seenRoots.add(root);
      return true;
    });
  return currentRoots.sort((left, right) => toTimestamp(right.encounter_at || right.recorded_at) - toTimestamp(left.encounter_at || left.recorded_at));
};

export const buildProgressTimeline = ({
  weightRecords = [], glycemiaRecords = [], photos = [], clinicalRecords = [],
}) => {
  const growthEvents = weightRecords.flatMap((record) => {
    const hasWeight = record?.weight != null;
    const hasMeasurement = hasMeasurementData(record);
    if (!hasWeight && !hasMeasurement) return [];
    return [{
      ...record,
      id: record.id,
      kind: hasWeight && hasMeasurement ? 'anthropometry' : hasWeight ? 'weight' : 'measurement',
      date: record.record_date,
    }];
  });
  const events = [
    ...growthEvents,
    ...glycemiaRecords.map((record) => ({ ...record, id: record.id, kind: 'glycemia', date: record.date })),
    ...photos.map((record) => ({ ...record, id: record.id, kind: 'photo', date: record.photo_date })),
    ...getCurrentSharedClinicalRecords(clinicalRecords).map((record) => ({
      ...record, id: record.id, kind: 'clinical', readOnly: true,
      date: record.encounter_at || record.recorded_at,
    })),
  ];
  return events.sort((left, right) => toTimestamp(right.date) - toTimestamp(left.date));
};
