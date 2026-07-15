import { describe, expect, it } from 'vitest';
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
