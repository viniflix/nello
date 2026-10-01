// Only independently named technical identifiers survive the general UUID mask.
export function technicalIdentity(value) {
  return typeof value === 'string' && /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|obs-[a-z0-9-]+)$/i.test(value)
    ? value : null;
}
