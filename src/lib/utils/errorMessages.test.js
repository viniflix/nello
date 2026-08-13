import { describe, expect, it } from 'vitest';
import { toPortugueseError } from './errorMessages';

describe('toPortugueseError', () => {
  it('preserves actionable password validation written by the application', () => {
    expect(toPortugueseError('As senhas não coincidem.')).toBe('As senhas não coincidem.');
    expect(toPortugueseError('Solicite um novo link e tente novamente.')).toBe(
      'Solicite um novo link e tente novamente.',
    );
  });

  it('translates known provider errors without exposing raw English messages', () => {
    expect(toPortugueseError('Invalid login credentials')).toBe('E-mail ou senha inválidos.');
  });

  it('keeps unknown provider details behind the safe generic fallback', () => {
    expect(toPortugueseError('unexpected_internal_provider_detail')).toBe(
      'Ocorreu um erro. Tente novamente.',
    );
  });
});
