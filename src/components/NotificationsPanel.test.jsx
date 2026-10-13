import { describe, expect, it, vi } from 'vitest';
import { getNotificationMeta } from './NotificationsPanel';
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: {} }));

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
  it('shows the exact agenda notice state rather than replacing it with a generic title', () => {
    expect(getNotificationMeta({ type: 'appointment_canceled', title: 'Consulta removida', message: 'Este agendamento foi removido.' }, 'patient')).toMatchObject({ title: 'Consulta removida', description: 'Este agendamento foi removido.', ctaPath: '/patient' });
    expect(getNotificationMeta({ type: 'appointment_notice_closed', title: 'Lembrete encerrado', message: 'O acompanhamento foi encerrado.', link_url: '/patient' }, 'patient')).toMatchObject({ title: 'Lembrete encerrado', description: 'O acompanhamento foi encerrado.', ctaPath: '/patient' });
  });
  it('formats a legacy reminder in the clinic timezone without asserting current delivery', () => {
    const meta = getNotificationMeta({ type: 'appointment_reminder', content: { appointment_time: '2034-10-12T02:00:00Z' } }, 'patient');
    expect(meta.description).toContain('11/10/2034'); expect(meta.description).toContain('23:00');
    expect(meta.description).not.toContain('entregue');
  });
  it('keeps post-consultation text inside the recipient route and rejects an external link', () => {
    expect(getNotificationMeta({ type: 'post_consultation', title: 'Após a consulta', message: 'Confira suas orientações.', link_url: 'https://evil.example' }, 'patient')).toMatchObject({ title: 'Após a consulta', description: 'Confira suas orientações.', ctaPath: '/patient' });
  });
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
