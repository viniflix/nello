import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import { track } from '@/infrastructure/analytics/posthog';
import { captureOperationalError } from './telemetry';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((callback) => callback({
    setContext: vi.fn(),
    setFingerprint: vi.fn(),
    setLevel: vi.fn(),
    setTags: vi.fn(),
  })),
}));

vi.mock('@/infrastructure/analytics/posthog', () => ({
  Events: { OPERATION_FAILED: 'operation_failed' },
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
  track: vi.fn(),
}));

describe('captureOperationalError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('correlates handled failures without sending Supabase details or hints', () => {
    const id = captureOperationalError({
      code: '42501',
      message: 'permission denied for table meal_plans',
      details: 'patient data must not leave the app',
      hint: 'private hint',
      status: 403,
    }, {
      operation: 'save_meal_plan',
      module: 'meal_plan',
      source: 'supabase',
    });

    expect(id).toMatch(/^([0-9a-f-]{36}|obs-)/);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('operation_failed', expect.objectContaining({
      correlation_id: id,
      operation: 'save_meal_plan',
      error_code: '42501',
      http_status: 403,
    }));
    expect(JSON.stringify(track.mock.calls)).not.toContain('patient data');
    expect(JSON.stringify(track.mock.calls)).not.toContain('private hint');
    const captured = Sentry.captureException.mock.calls[0][0];
    expect(captured.message).not.toContain('patient data');
    expect(captured.message).not.toContain('permission denied for table');
    expect(captured.cause).toBeUndefined();
  });

  it('identifies network failures without forwarding raw error text', () => {
    captureOperationalError({ message: 'Failed to fetch: patient@example.com' }, {
      operation: 'load_feed', module: 'feed', source: 'supabase',
    });
    expect(Sentry.captureException.mock.calls[0][0].message).toContain('network_failure');
    expect(Sentry.captureException.mock.calls[0][0].message).not.toContain('patient@example.com');
  });

  it('classifies authorization and clinical rule failures by safe codes', () => {
    captureOperationalError({ code: '42501', message: 'Private patient details' }, {
      operation: 'save_measurement', module: 'clinical', source: 'supabase',
    });
    captureOperationalError({ code: 'P0001', message: 'Private patient details' }, {
      operation: 'save_measurement', module: 'clinical', source: 'supabase',
    });
    expect(Sentry.captureException.mock.calls.map(([error]) => error.message)).toEqual([
      '[42501] save_measurement failed (access_denied)',
      '[P0001] save_measurement failed (business_rule_rejected)',
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toContain('Private patient details');
  });
});
