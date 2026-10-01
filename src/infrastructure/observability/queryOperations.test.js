import { describe, expect, it } from 'vitest';
import { queryOperation } from './queryOperations';

describe('reviewed query operation catalog', () => {
  it('keeps static wrapper and Hub identifiers and rejects legacy free text', () => {
    expect(queryOperation('erro_ao_listar_anexos_clinicos')).toBe('erro_ao_listar_anexos_clinicos');
    expect(queryOperation('erro_ao_carregar_proxima_consulta_do_hub')).toBe('erro_ao_carregar_proxima_consulta_do_hub');
    expect(queryOperation('Erro ao listar anexos clínicos')).toBe('unknown_operation');
  });
  it('keeps existing technical RPC identifiers without runtime text normalization', () => {
    expect(queryOperation('record_my_privacy_choice')).toBe('record_my_privacy_choice');
    expect(queryOperation(undefined)).toBe('unknown_operation');
    expect(queryOperation('Erro paciente@example.com token=SECRET')).toBe('unknown_operation');
    expect(queryOperation('Dados clínicos desconhecidos')).toBe('unknown_operation');
  });
});
