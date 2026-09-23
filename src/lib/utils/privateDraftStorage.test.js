import { beforeEach, describe, expect, it } from 'vitest';
import { clearPrivateDraftStorage } from './privateDraftStorage';

describe('clearPrivateDraftStorage', () => {
  beforeEach(() => sessionStorage.clear());

  it('removes clinical drafts at logout without removing unrelated tab state', () => {
    sessionStorage.setItem('nello_shadow:nutritionist:plan', 'private plan');
    sessionStorage.setItem('nello_anamnesis:patient:record', 'private answers');
    sessionStorage.setItem('nello_public_anamnesis:record:token', 'private answers');
    sessionStorage.setItem('nello:chunk-reload:release:page', 'retry state');
    clearPrivateDraftStorage(sessionStorage);
    expect([...Array(sessionStorage.length)].map((_, index) => sessionStorage.key(index))).toEqual(['nello:chunk-reload:release:page']);
  });
});
