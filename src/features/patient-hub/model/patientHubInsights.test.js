import { describe, expect, it } from 'vitest';
import { buildPatientHubInsights } from './patientHubInsights';

const now = new Date('2026-09-04T12:00:00.000Z');

describe('buildPatientHubInsights', () => {
  it('does not recommend creating a plan when the plan query failed', () => {
    const result = buildPatientHubInsights({ operationalContext: { planStatus: 'unknown', partialErrors: ['planos alimentares'] }, now });
    expect(result.primary.id).toBe('incomplete-data');
    expect(result.primary.action.type).toBe('refresh');
    expect(result.signals.some((signal) => signal.id === 'create-meal-plan')).toBe(false);
  });

  it('does not declare follow-up healthy when an optional source failed', () => {
    const result = buildPatientHubInsights({ operationalContext: { activePlan: { id: 1 }, planStatus: 'active', partialErrors: ['check-in mais recente'] }, now });
    expect(result.primary.id).toBe('incomplete-data');
  });
  it('prioriza campos obrigatórios pendentes', () => {
    const result = buildPatientHubInsights({
      profileRequirements: ['birth_date'],
      operationalContext: {},
      now,
    });

    expect(result.primary.id).toBe('complete-profile');
    expect(result.primary.action).toEqual({ type: 'edit-profile' });
  });

  it('prioriza retomada de rascunho sem inventar dados', () => {
    const result = buildPatientHubInsights({
      operationalContext: {
        draftPlan: { id: 7, name: 'Plano setembro', updated_at: '2026-09-03T10:00:00.000Z' },
      },
      now,
    });

    expect(result.primary.id).toBe('resume-draft-plan');
    expect(result.primary.reasons).toContain('Rascunho: Plano setembro');
  });

  it('recomenda iniciar plano quando nenhum plano existe', () => {
    const result = buildPatientHubInsights({ operationalContext: {}, now });
    expect(result.primary.id).toBe('create-meal-plan');
    expect(result.primary.action.type).toBe('meal-plan');
  });

  it('sinaliza adesão baixa quando há registros suficientes', () => {
    const result = buildPatientHubInsights({
      operationalContext: { activePlan: { id: 1 }, planStatus: 'active' },
      adherence: { totalMeals: 5, adherencePercentage: 42, daysWithRecords: 3, totalDays: 7 },
      now,
    });

    expect(result.primary.id).toBe('review-low-adherence');
    expect(result.primary.reasons).toContain('Adesão registrada: 42%');
  });

  it('mantém recomendação neutra quando o acompanhamento está em dia', () => {
    const result = buildPatientHubInsights({
      operationalContext: { activePlan: { id: 1 }, planStatus: 'active' },
      modulesStatus: { anamnese: 'completed' },
      adherence: { totalMeals: 7, adherencePercentage: 100, daysWithRecords: 7, totalDays: 7 },
      now,
    });

    expect(result.primary.id).toBe('review-overview');
    expect(result.methodology).toMatch(/explicável/i);
  });
});
