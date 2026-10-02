// No clinical payload is persisted in Web Storage, IndexedDB or a service worker.
import { draftEntries as entries } from './memoryDraftState';
export { clearMemoryDrafts } from './memoryDraftState';
export const DRAFT_TTL_MS = 30 * 60 * 1000;
export const DRAFT_MAX_BYTES = 256 * 1024;
export const DRAFT_MAX_ENTRIES = 20;
function sweep() { for (const [key,value] of entries) if (value.expires <= Date.now()) entries.delete(key); }
export const removeMemoryDraft = key => entries.delete(key);
export function readMemoryDraft(key) {
  sweep();
  // Upgrade only the exact authorized caller's old same-tab copy, then remove plaintext.
  if (!entries.has(key)) {
    try { const old = JSON.parse(sessionStorage.getItem(key) || 'null'); sessionStorage.removeItem(key); if (old && Date.now()-old.savedAt < DRAFT_TTL_MS) writeMemoryDraft(key,old); } catch { /* No recovery from invalid legacy data. */ }
  }
  const found = entries.get(key);
  return found ? structuredClone(found.value) : null;
}
export function writeMemoryDraft(key,value) {
  sweep();
  if ((!entries.has(key) && entries.size >= DRAFT_MAX_ENTRIES) || new TextEncoder().encode(JSON.stringify(value)).length > DRAFT_MAX_BYTES) throw new Error('Limite do rascunho em memória atingido. Salve no servidor antes de continuar.');
  entries.set(key,{value:structuredClone(value),expires:Date.now()+DRAFT_TTL_MS});
}
