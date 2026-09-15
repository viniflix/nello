import { describe, expect, it } from 'vitest';
import { safeExternalHttpUrl, safeInternalPath } from './navigation';

describe('safeInternalPath', () => {
  it.each([
    '/patient/progresso',
    '/nutritionist/patients/id/hub?tab=clinical#latest',
  ])('preserves a same-origin application path: %s', (path) => {
    expect(safeInternalPath(path, '/fallback')).toBe(path);
  });

  it.each([
    'https://evil.example/phishing',
    '//evil.example/phishing',
    '/\\evil.example/phishing',
    '/%5cevil.example/phishing',
    `${'java'}script:alert(1)`,
    '/bad%ZZpath',
  ])('rejects an untrusted navigation target: %s', (path) => {
    expect(safeInternalPath(path, '/fallback')).toBe('/fallback');
  });
});

describe('safeExternalHttpUrl', () => {
  it('accepts only absolute HTTP(S) sources', () => {
    expect(safeExternalHttpUrl('https://pubmed.ncbi.nlm.nih.gov/123/')).toBe('https://pubmed.ncbi.nlm.nih.gov/123/');
    expect(safeExternalHttpUrl('http://example.test/reference')).toBe('http://example.test/reference');
  });

  it.each([
    `${'java'}script:alert(1)`,
    'data:text/html,unsafe',
    '/relative/source',
    'not a url',
  ])('rejects an unsafe external source: %s', (value) => {
    expect(safeExternalHttpUrl(value)).toBeNull();
  });
});
