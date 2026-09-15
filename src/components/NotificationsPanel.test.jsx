import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
import { getNotificationMeta } from './NotificationsPanel';

describe('clinical amendment notifications', () => {
  it.each([
    ['clinical_record_corrected', 'Registro clínico corrigido'],
    ['clinical_record_invalidated', 'Registro clínico invalidado'],
  ])('maps %s to the patient records page without clinical content', (type, title) => {
    const meta = getNotificationMeta({ type, content: { message: 'Dado clínico que não deve aparecer.' } }, 'patient');
    expect(meta).toEqual(expect.objectContaining({
      title,
      ctaLabel: 'Ver registro',
      ctaPath: '/patient/registros-clinicos',
      description: 'Seu registro clínico recebeu uma atualização.',
    }));
    expect(meta.description).not.toContain('Dado clínico');
  });
});

describe('patient notification routes', () => {
  it.each([
    ['new_achievement', '/patient/conquistas'],
    ['new_weekly_summary', '/patient/progresso'],
    ['measurement_reminder', '/patient/perfil'],
  ])('maps %s to an existing patient route', (type, ctaPath) => {
    expect(getNotificationMeta({ type }, 'patient').ctaPath).toBe(ctaPath);
  });

  it('rejects external and protocol-relative link_url values', () => {
    expect(getNotificationMeta({ type: 'info', link_url: 'https://evil.example' }, 'patient').ctaPath).toBe('/patient');
    expect(getNotificationMeta({ type: 'unknown', link_url: '//evil.example' }, 'nutritionist').ctaPath).toBe('/nutritionist');
  });

  it('uses canonical text for daily reminders with corrupted persisted encoding', () => {
    const meta = getNotificationMeta({
      type: 'daily_log_reminder',
      content: { message: 'NÃ£o se esqueÃ§a de registrar suas refeiÃ§Ãµes hoje!' },
    }, 'patient');

    expect(meta.description).toBe('Não se esqueça de registrar suas refeições hoje!');
  });
});
