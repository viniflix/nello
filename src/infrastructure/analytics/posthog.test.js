import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsProperties } from './posthog';

describe('sanitizeAnalyticsProperties', () => {
  it('keeps operational metrics and removes nested personal or clinical data', () => {
    const source = {
      feature: 'agenda',
      duration_ms: 120,
      patient_name: 'Maria',
      email: 'patient@example.com',
      payload: {
        diagnosis: 'sensitive',
        message: 'clinical text',
        item_count: 3,
      },
    };

    expect(sanitizeAnalyticsProperties(source)).toEqual({
      feature: 'agenda',
      duration_ms: 120,
      payload: { item_count: 3 },
    });
    expect(source.payload.diagnosis).toBe('sensitive');
  });
});
