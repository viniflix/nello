// Server-owned worker. API deletion removes bytes; SQL only changes the ledger.
// Bound clinical records cannot enter this technical-orphan cleanup queue.
export async function cleanExpiredUploads(admin: any) {
  const { data, error } = await admin.rpc('claim_expired_storage_uploads', { p_limit: 50 });
  if (error) throw new Error('cleanup_claim_failed');
  let removed = 0;
  for (const item of data || []) {
    const { error: removeError } = await admin.storage.from(item.bucket_id).remove([item.object_path]);
    if (removeError) continue;
    const { error: finishError } = await admin.rpc('finish_expired_storage_upload_cleanup', { p_reservation_id: item.id });
    if (!finishError) removed++;
  }
  return { claimed: data?.length || 0, removed };
}

export async function cleanApprovedErasures(admin: any) {
  const { data, error } = await admin.rpc('claim_storage_erasure_work', { p_limit: 50 });
  if (error) throw new Error('erasure_claim_failed');
  let removed = 0;
  for (const item of data || []) {
    const { error: removeError } = await admin.storage.from(item.bucket_id).remove([item.object_path]);
    if (removeError) continue;
    const { error: finishError } = await admin.rpc('finish_storage_erasure_work', { p_work_id: item.id });
    if (!finishError) removed++;
  }
  return { claimed: data?.length || 0, removed };
}
