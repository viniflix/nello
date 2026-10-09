import { describe, it, expect } from 'vitest';
import { getRouteMetadata, getPublicStructuredData, serializePublicStructuredData } from './metadataPolicy';
describe('route metadata privacy and public contracts', () => {
  it.each(['/nutritionist/patients/PRIVATE_PATIENT/hub', '/f/PRIVATE_INVITATION', '/verificar-documento/PRIVATE_CODE', '/admin/users/PRIVATE_PATIENT', '/unknown/PRIVATE_SENTINEL'])('never exposes dynamic segments for %s', path => {
    const meta = getRouteMetadata(path);
    expect(JSON.stringify(meta)).not.toContain('PRIVATE_');
    expect(meta.robots).toBe('noindex,nofollow');
    expect(meta.canonical).toBe('https://nellonutri.com.br/');
  });
  it.each(['/', '/recursos', '/para-pacientes', '/pesquisa', '/ajuda', '/termos', '/privacidade', '/seguranca'])('indexes only intended public information %s', path => {
    expect(getRouteMetadata(path).robots).toBe('index,follow');
    expect(getRouteMetadata(path + (path === '/' ? '' : '/')).canonical).toBe('https://nellonutri.com.br' + path);
  });
  it('identifies the clinical module using static segments alone', () => {
    expect(getRouteMetadata('/nutritionist/patients/private-id/energy-expenditure').title).toBe('Cálculos nutricionais — Nello');
  });
  it('publishes factual identity and route hierarchy only for indexable public pages', () => {
    const home = getPublicStructuredData('/');
    expect(home['@graph'][0]).toMatchObject({ name:'Nello', email:'suporte@nellonutri.com.br' });
    expect(getPublicStructuredData('/pesquisa/').itemListElement[1].item).toBe('https://nellonutri.com.br/pesquisa');
    for(const path of ['/login','/register','/status','/f/PRIVATE_TOKEN','/verificar-documento/PRIVATE_CODE','/nutritionist/patients/PRIVATE_ID']) expect(serializePublicStructuredData(path)).toBeNull();
    expect(JSON.stringify(home)).not.toMatch(/aggregateRating|offers|review/);
  });
  it.each([['/verificar-documento/PRIVATE_CODE','Verificar documento — Nello'],['/f/PRIVATE_TOKEN','Questionário nutricional — Nello']])('labels public utility %s without exposing its identifier', (path,title) => {
    const meta=getRouteMetadata(path);
    expect(meta.title).toBe(title);
    expect(JSON.stringify(meta)).not.toContain('PRIVATE_');
    expect(meta.robots).toBe('noindex,nofollow');
    expect(meta.canonical).toBe('https://nellonutri.com.br/');
    expect(getPublicStructuredData(path)).toBeNull();
  });
});
