import { describe, expect, it } from 'vitest';
import {
  calculateCheckinScore,
  cloneAnamnesisSections,
  findMissingRequiredField,
  isFormValuePresent,
  validateAnamnesisTemplate,
  validateCheckinTemplate,
} from './formContracts';

describe('contratos de respostas', () => {
  it('aceita zero e false como respostas válidas', () => {
    expect(isFormValuePresent(0)).toBe(true);
    expect(isFormValuePresent(false)).toBe(true);
    expect(isFormValuePresent('   ')).toBe(false);
  });

  it('localiza campo obrigatório ignorado antes da última etapa', () => {
    const fields = [{ id: 'first', label: 'Primeira', is_required: true }, { id: 'last', is_required: false }];
    expect(findMissingRequiredField(fields, {})).toEqual(fields[0]);
  });

  it('calcula a pontuação a partir das definições dos campos', () => {
    expect(calculateCheckinScore([
      { id: 'scale', field_type: 'scale_1_10', score_weight: 2 },
      { id: 'boolean', field_type: 'yes_no', score_weight: 1 },
    ], { scale: [7], boolean: 'yes' })).toEqual({ total: 24, maximum: 30 });
  });
});

describe('template de check-in', () => {
  const valid = {
    name: 'Acompanhamento',
    channel: 'in_app',
    fields: [{ label: 'Como foi?', field_type: 'scale_1_10', score_weight: 1 }],
  };

  it('aceita um template executável', () => expect(validateCheckinTemplate(valid)).toBeNull());
  it('rejeita foto e canal sem implementação', () => {
    expect(validateCheckinTemplate({ ...valid, fields: [{ ...valid.fields[0], field_type: 'photo' }] })).toMatch(/tipo/);
    expect(validateCheckinTemplate({ ...valid, channel: 'whatsapp' })).toMatch(/App Nello/);
  });
  it('rejeita múltipla escolha sem duas opções diferentes', () => {
    expect(validateCheckinTemplate({ ...valid, fields: [{ label: 'Escolha', field_type: 'multiple_choice', score_weight: 0, options: ['A', 'A'] }] })).toMatch(/duas opções/);
  });
});

describe('template de anamnese', () => {
  it('rejeita condição órfã e seção vazia', () => {
    expect(validateAnamnesisTemplate({ title: 'Anamnese', sections: [{ id: 's', title: 'Dados', fields: [] }] })).toMatch(/pergunta/);
    expect(validateAnamnesisTemplate({
      title: 'Anamnese',
      sections: [{ id: 's', title: 'Dados', fields: [{ id: 'f', type: 'text', label: 'Nome', conditional_logic: { field_id: 'missing' } }] }],
    })).toMatch(/condição/);
  });
});

describe('clone de anamnese', () => {
  it('regenera identificadores e remapeia dependências sem alterar a origem', () => {
    const source = [{
      id: 'section-old',
      title: 'Hábitos',
      fields: [
        { id: 'trigger-old', label: 'Pratica atividade?', type: 'radio' },
        { id: 'detail-old', label: 'Qual?', type: 'text', conditional_logic: { field_id: 'trigger-old', operator: 'equals', value: 'sim' } },
      ],
    }];
    let sequence = 0;
    const cloned = cloneAnamnesisSections(source, () => `new-${++sequence}`);

    expect(cloned[0].id).not.toBe(source[0].id);
    expect(cloned[0].fields[0].id).not.toBe('trigger-old');
    expect(cloned[0].fields[1].conditional_logic.field_id).toBe(cloned[0].fields[0].id);
    expect(source[0].fields[1].conditional_logic.field_id).toBe('trigger-old');
  });
});
