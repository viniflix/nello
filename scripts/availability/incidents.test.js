// @vitest-environment node
import { expect, it } from 'vitest';
import { publicIncidents } from '../../operations/availability/incidents.mjs';

it('publishes only approved incident fields and rejects invalid public messages', () => {
  const record = { id: 'availability-2026-09', state: 'investigating', title: 'Instabilidade na autenticação',
    message: 'Estamos investigando falhas de acesso.', updatedAt: '2026-09-30T23:00:00Z', internalDebug: 'must not be published' };
  expect(publicIncidents([record])[0]).not.toHaveProperty('internalDebug');
  expect(() => publicIncidents([{ ...record, message: '<script>' }])).toThrow();
  expect(() => publicIncidents([{ ...record, updatedAt: 'invalid' }])).toThrow();
  expect(() => publicIncidents(Array(11).fill(record))).toThrow();
});
