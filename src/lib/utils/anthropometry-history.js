export const isCurrentMeasurement = record => record?.is_latest_revision !== false;

export function isSameMeasurementRevision(first, second) {
  if (!first || !second) return false;
  if (first.id === second.id) return true;
  if (first.revision_group_id != null && second.revision_group_id != null) {
    return String(first.revision_group_id) === String(second.revision_group_id);
  }
  return (first.supersedes_record_id != null && String(first.supersedes_record_id) === String(second.id)) ||
    (second.supersedes_record_id != null && String(second.supersedes_record_id) === String(first.id));
}
