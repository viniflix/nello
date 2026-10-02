import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryDrafts, readMemoryDraft, writeMemoryDraft, DRAFT_TTL_MS, DRAFT_MAX_ENTRIES, DRAFT_MAX_BYTES } from './memoryDrafts';
describe('private in-memory drafts', () => {
  beforeEach(() => { clearMemoryDrafts();sessionStorage.clear();localStorage.clear(); });
  afterEach(() => vi.useRealTimers());
  it('keeps edits only in memory and clears them on identity loss', () => {
    writeMemoryDraft('clinical:actor1',{value:{answer:'synthetic'}});
    expect(readMemoryDraft('clinical:actor1').value.answer).toBe('synthetic');
    expect(sessionStorage.length).toBe(0);expect(localStorage.length).toBe(0);
    clearMemoryDrafts();expect(readMemoryDraft('clinical:actor1')).toBeNull();
  });
  it('expires drafts and enforces both count and byte limits', () => {
    vi.useFakeTimers();
    for(let i=0;i<DRAFT_MAX_ENTRIES;i++)writeMemoryDraft(String(i),{value:i});
    expect(()=>writeMemoryDraft('extra',{value:1})).toThrow();
    vi.advanceTimersByTime(DRAFT_TTL_MS+1);
    expect(readMemoryDraft('0')).toBeNull();
    expect(()=>writeMemoryDraft('huge',{value:'x'.repeat(DRAFT_MAX_BYTES)})).toThrow();
    writeMemoryDraft('extra',{value:1});
  });
  it('migrates the authorized legacy copy once, removing persisted plaintext', () => {
    sessionStorage.setItem('same-owner',JSON.stringify({value:1,savedAt:Date.now()}));
    expect(readMemoryDraft('same-owner').value).toBe(1);
    expect(sessionStorage.getItem('same-owner')).toBeNull();
  });
});
