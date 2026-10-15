import { beforeEach, expect, it, vi } from 'vitest';
import { getPatientHomeLink, getPatientHomeAppointment, getPatientHomeMeals } from './patient-home-queries';
import { patientClient } from '@/infrastructure/supabase/domainClients';
import { RESERVING_APPOINTMENT_STATUSES } from '@/lib/agenda/appointment-rules';
vi.mock('@/infrastructure/supabase/domainClients', () => ({ patientClient: { from: vi.fn() } }));
let query;
beforeEach(() => {
  query = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'order', 'limit', 'maybeSingle', 'is', 'abortSignal']) query[method] = vi.fn(() => query);
  patientClient.from.mockReset().mockReturnValue(query);
});
it('passes the scoped actor, future start and reserving statuses to the appointment read', () => {
  const signal = new AbortController().signal;
  getPatientHomeAppointment('synthetic-a', '2026-10-13T12:00:00Z', signal);
  expect(patientClient.from).toHaveBeenCalledWith('appointments');
  expect(query.eq).toHaveBeenCalledWith('patient_id', 'synthetic-a');
  expect(query.gte).toHaveBeenCalledWith('start_time', '2026-10-13T12:00:00Z');
  expect(query.in).toHaveBeenCalledWith('status', RESERVING_APPOINTMENT_STATUSES);
  expect(query.limit).toHaveBeenCalledWith(1); expect(query.abortSignal).toHaveBeenCalledWith(signal);
});
it('scopes the daily count to the actor and excludes deleted meals', () => {
  const signal = new AbortController().signal;
  getPatientHomeMeals('synthetic-b', '2026-10-13', signal);
  expect(query.eq).toHaveBeenCalledWith('patient_id', 'synthetic-b'); expect(query.eq).toHaveBeenCalledWith('meal_date', '2026-10-13');
  expect(query.is).toHaveBeenCalledWith('deleted_at', null); expect(query.select.mock.calls[0][1]).toEqual({ count: 'exact' });
  expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(query.limit).toHaveBeenCalledWith(250);expect(query.order).toHaveBeenCalledWith('id',{ascending:true});
});
it('reads the pending link only for the current pair with the same cancellation signal', () => {
  const signal = new AbortController().signal;
  getPatientHomeLink('synthetic-a', 'synthetic-n', signal);
  expect(query.eq).toHaveBeenCalledWith('patient_id', 'synthetic-a'); expect(query.eq).toHaveBeenCalledWith('nutritionist_id', 'synthetic-n');
  expect(query.abortSignal).toHaveBeenCalledWith(signal);
});
it('returns a denied Result without disguising it as a successfully empty dataset', async () => {
  const response = { data: null, error: { code: '42501' } };
  query.then = resolve => Promise.resolve(response).then(resolve);
  expect(await getPatientHomeMeals('synthetic-a', '2026-10-13', new AbortController().signal)).toBe(response);
});
