export function normalizeAuthEmail(value: unknown): string { return String(value || '').trim().toLowerCase(); }
