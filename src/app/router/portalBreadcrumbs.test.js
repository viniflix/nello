import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPortalBreadcrumbs, portalBreadcrumbRoutes } from './portalBreadcrumbs';

const concretize = pattern => pattern.replace(/:([\w]+)\??/g, (_, name) => name === 'type' ? 'diet' : `synthetic-${name}`);
describe('portal breadcrumb route coverage', () => {
  const declared = ['nutritionistRoutes.jsx', 'patientRoutes.jsx'].flatMap(file => [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/path="([^"]+)"/g)].map(match => match[1]));
  it.each(declared)('covers declared route %s with valid ancestors', pattern => {
    const crumbs = getPortalBreadcrumbs(concretize(pattern));
    expect(crumbs.length).toBeGreaterThan(0);
    expect(crumbs.every(crumb => crumb.label && !crumb.label.includes('synthetic-'))).toBe(true);
    for (const ancestor of crumbs.slice(0, -1)) {
      expect(ancestor.to).toBeTruthy();
      expect(getPortalBreadcrumbs(ancestor.to.split('?')[0]).length).toBeGreaterThan(0);
    }
  });
  it('uses exact matching, optional params and stable labels instead of private IDs', () => {
    expect(getPortalBreadcrumbs('/patient/add-food').at(-1).label).toBe('Registrar refeição');
    expect(getPortalBreadcrumbs('/patient/add-food/private-id').at(-1).label).toBe('Editar refeição');
    expect(getPortalBreadcrumbs('/nutritionist/templates/forms/new').at(-1).label).toBe('Nova anamnese');
    expect(getPortalBreadcrumbs('/nutritionist/templates/new/private-title').at(-1).label).toBe('Novo modelo');
    expect(getPortalBreadcrumbs('/nutritionist/patients/synthetic/hub', '?tab=nutrition').at(-1).label).toBe('Nutrição');
    expect(getPortalBreadcrumbs('/patient/not-a-route')).toEqual([]);
    expect(getPortalBreadcrumbs('/admin/dashboard')).toEqual([]);
  });
  it('registers each route once and does not mutate definitions when an editor adds a crumb', () => {
    expect(new Set(portalBreadcrumbRoutes.map(route => route.path)).size).toBe(portalBreadcrumbRoutes.length);
    getPortalBreadcrumbs('/patient').push({ label: 'Other' });
    expect(getPortalBreadcrumbs('/patient')).toHaveLength(1);
  });
});
