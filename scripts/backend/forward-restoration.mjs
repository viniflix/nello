export function assertForwardRestoration(restoration, now = Date.now()) {
  const captured = Date.parse(restoration.capturedAt);
  if (restoration.applicationCatalogMatched !== true || restoration.productionData !== false
    || restoration.database !== 'nello_qa_wave02_template' || restoration.guard !== 'supabase_admin:0'
    || !Number.isFinite(captured) || captured > now || now - captured > 15 * 60 * 1000) {
    throw Error('Verified fresh synthetic restoration required.');
  }
}
