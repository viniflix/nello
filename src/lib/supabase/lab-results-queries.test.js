import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateStatus, classifyLabResultRisk, classifyLabResultsRiskBatch, createLabResult, getPatientLabResults, updateLabResult } from './lab-results-queries';

const mocks = vi.hoisted(() => ({ rows: [], requests: [], rpc: vi.fn(), clinicalRpc: vi.fn(), failure: null }));
vi.mock('@/infrastructure/supabase/domainClients', () => ({ clinicalClient: {
  rpc: (...args) => mocks.rpc(...args),
  from: (table) => {
    const request = { table, filters: [], orders: [], start: 0, end: 999 };
    mocks.requests.push(request);
    const query = {
      select: () => query,
      eq: (key, value) => { request.filters.push([key, value]); return query; },
      order: (key, options) => { request.orders.push([key, options]); return query; },
      range: (start, end) => { request.start = start; request.end = end; return query; },
      limit: (limit) => { request.end = limit - 1; return query; },
      abortSignal: () => query,
      single: () => { request.single = true; return query; },
      then: (resolve, reject) => {
        const rows = mocks.rows.filter(row => request.filters.every(([key, value]) => row[key] === value))
          .sort((a, b) => String(b.test_date).localeCompare(String(a.test_date)) || b.id - a.id);
        return Promise.resolve({ data: request.single ? rows[0] : rows.slice(request.start, request.end + 1), error: mocks.failure }).then(resolve, reject);
      },
    };
    return query;
  },
} }));
vi.mock('@/lib/supabase/idempotent-mutations', () => ({ clinicalRpc: (...args) => mocks.clinicalRpc(...args) }));
vi.mock('@/lib/storage/verifiedUpload', () => ({ uploadVerifiedFile: vi.fn() }));
vi.mock('@/lib/storage/privateFiles', () => ({ parsePrivateFile: vi.fn(), signPrivateFile: vi.fn() }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));

const numeric = { test_name: 'Marcador sintético', test_value: '100', test_unit: 'mg/dL', reference_min: 50, reference_max: 150 };
beforeEach(() => { mocks.rows = []; mocks.requests = []; mocks.failure = null; vi.clearAllMocks(); mocks.clinicalRpc.mockResolvedValue({ data: { id: 1 }, error: null }); mocks.rpc.mockResolvedValue({ data: { id: 2 }, error: null }); });

describe('laboratory numeric interpretation shared by preview, risk and writes', () => {
  it.each([null, undefined, '', '  '])('does not classify an absent result (%s) as zero', value => {
    expect(classifyLabResultRisk({ ...numeric, test_value: value }).risk_level).toBe('unknown');
  });
  it('does not turn absent references into zero thresholds', () => {
    expect(classifyLabResultRisk({ ...numeric, reference_min: null, reference_max: null }).risk_level).toBe('unknown');
    expect(calculateStatus('100', null, null)).toBe('pending');
  });
  it('parses decimal comma consistently without accepting numeric prefixes or grouping', () => {
    expect(calculateStatus('5,5', '5,2', '6')).toBe('normal');
    expect(classifyLabResultRisk({ ...numeric, test_value: '5,5', reference_min: 5.2, reference_max: 6 }).risk_level).toBe('none');
    for (const value of ['5mg/dL', '1.234,56', '1,234.56', 'Infinity', '0x10', 'positivo']) {
      expect(calculateStatus(value, 5.2, 6)).toBe('pending');
      expect(classifyLabResultRisk({ ...numeric, test_value: value }).risk_level).toBe('unknown');
    }
  });
  it('preserves explicit zero and handles unilateral and inverted references', () => {
    expect(calculateStatus('0', 0, 10)).toBe('normal');
    expect(calculateStatus('3', 5, null)).toBe('low');
    expect(calculateStatus('7', null, 5)).toBe('high');
    expect(calculateStatus('7', 5, null)).toBe('pending');
    expect(calculateStatus('7', 10, 5)).toBe('pending');
  });
  it('requires a compatible unit before applying a named risk rule', () => {
    const rule = { marker_key: 'marcador_sintetico', unit: 'mg/dL', low_threshold: 70, high_threshold: 180, risk_low: 'high' };
    expect(classifyLabResultRisk({ ...numeric, test_value: '5,5', test_unit: 'mmol/L' }, [rule]).risk_level).toBe('unknown');
    expect(classifyLabResultRisk({ ...numeric, test_unit: '' }, [rule]).risk_level).toBe('unknown');
    expect(classifyLabResultRisk({ ...numeric, test_unit: 'mg / dl', test_value: 200 }, [rule]).risk_level).toBe('high');
    expect(classifyLabResultRisk({ ...numeric, test_value: 100 }, [{ ...rule, high_threshold: null }]).risk_level).toBe('none');
  });
  it('keeps missing evaluations separate from a known result without alert', () => {
    const result = classifyLabResultsRiskBatch([numeric, { ...numeric, id: 2, test_value: null }]);
    expect(result.summary.unknown).toBe(1);
    expect(result.summary.total).toBe(2);
    expect(result.data[1].risk_level).toBe('unknown');
    expect(classifyLabResultsRiskBatch([{ ...numeric, test_value: null }]).summary.highest_risk).toBe('unknown');
  });
  it('writes canonical decimals while retaining qualitative results and the original snapshot', async () => {
    const snapshot = { source: 'synthetic original' };
    await createLabResult({ ...numeric, test_value: '5,5', reference_min: '5,2', reference_max: '6', reference_snapshot: snapshot });
    expect(mocks.clinicalRpc).toHaveBeenCalledWith('lab_result', { p_payload: expect.objectContaining({ test_value: '5.5', reference_min: 5.2, reference_max: 6, status: 'normal', reference_snapshot: snapshot }) });
    await createLabResult({ ...numeric, test_value: 'Negativo', reference_min: null, reference_max: null });
    expect(mocks.clinicalRpc.mock.lastCall[1].p_payload).toMatchObject({ test_value: 'Negativo', status: 'pending' });
  });
  it('rejects malformed numeric references before writing', async () => {
    const result = await createLabResult({ ...numeric, reference_min: '5oops' });
    expect(result.error).toBeTruthy();
    expect(mocks.clinicalRpc).not.toHaveBeenCalled();
  });
  it('propagates failure reading an existing revision instead of writing from missing context', async () => {
    mocks.failure = { code: '42501' };
    const result = await updateLabResult(1, { test_value: '5,5' });
    expect(result.error).toBe(mocks.failure);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('complete bounded laboratory history', () => {
  it('reads beyond the old 50 and provider 1000-row limits in stable pages, excluding old revisions', async () => {
    mocks.rows = Array.from({ length: 1001 }, (_, i) => ({ ...numeric, id: i + 1, patient_id: 'synthetic-patient', test_date: '2026-10-01', is_latest_revision: true, record_status: 'active' }));
    mocks.rows.push({ ...mocks.rows[0], id: 9000, is_latest_revision: false });
    const result = await getPatientLabResults('synthetic-patient');
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1001);
    expect(new Set(result.data.map(row => row.id)).size).toBe(1001);
    expect(mocks.requests.length).toBeGreaterThan(1);
    expect(mocks.requests[0].orders.map(([key]) => key)).toEqual(['test_date', 'id']);
  });
  it('does not present a truncated collection as a complete history', async () => {
    mocks.rows = Array.from({ length: 10001 }, (_, i) => ({ id: i + 1, patient_id: 'synthetic-patient', test_date: '2026-10-01', is_latest_revision: true, record_status: 'active' }));
    const result = await getPatientLabResults('synthetic-patient');
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('REPORT_ROW_LIMIT_REACHED');
  });
});
