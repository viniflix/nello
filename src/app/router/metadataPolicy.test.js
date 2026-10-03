import { describe, it, expect } from 'vitest';
import { getRouteMetadata } from './metadataPolicy';
describe('route metadata privacy and public contracts', () => {
  it.each(['/nutritionist/patients/PRIVATE_PATIENT/hub', '/f/PRIVATE_INVITATION', '/verificar-documento/PRIVATE_CODE', '/admin/users/PRIVATE_PATIENT', '/unknown/PRIVATE_SENTINEL'])('never exposes dynamic segments for %s', path => {
    const meta = getRouteMetadata(path);
    expect(JSON.stringify(meta)).not.toContain('PRIVATE_');
    expect(meta.robots).toBe('noindex,nofollow');
    expect(meta.canonical).toBe('https://nellonutri.com.br/');
  });
  it.each(['/', '/recursos', '/para-pacientes', '/ajuda', '/termos', '/privacidade', '/seguranca'])('indexes only intended public information %s', path => {
    expect(getRouteMetadata(path).robots).toBe('index,follow');
    expect(getRouteMetadata(path + (path === '/' ? '' : '/')).canonical).toBe('https://nellonutri.com.br' + path);
  });
  it('identifies the clinical module using static segments alone', () => {
    expect(getRouteMetadata('/nutritionist/patients/private-id/energy-expenditure').title).toBe('Cálculos nutricionais — Nello');
  });
});
