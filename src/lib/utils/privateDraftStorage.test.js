import { beforeEach, describe, expect, it } from 'vitest';
import { clearPrivateDraftStorage } from './privateDraftStorage';

describe('clearPrivateDraftStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('removes clinical drafts at logout without removing unrelated tab state', () => {
    sessionStorage.setItem('nello_shadow:nutritionist:plan', 'private plan');
    sessionStorage.setItem('nello_anamnesis:patient:record', 'private answers');
    sessionStorage.setItem('nello_public_anamnesis:record:token', 'private answers');
    sessionStorage.setItem('nello:chunk-reload:release:page', 'retry state');
    localStorage.setItem('nello_offline_queue', '[{"type":"REDEEM_INVITE"}]');
    localStorage.setItem('anamnesis_step_record-id', '3');
    localStorage.setItem('theme', 'dark');
    clearPrivateDraftStorage(sessionStorage, localStorage);
    expect([...Array(sessionStorage.length)].map((_, index) => sessionStorage.key(index))).toEqual(['nello:chunk-reload:release:page']);
    expect(localStorage.getItem('nello_offline_queue')).toBeNull();
    expect(localStorage.getItem('anamnesis_step_record-id')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
