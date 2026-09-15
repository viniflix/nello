const CHECKIN_FIELD_TYPES = new Set(['scale_1_10', 'yes_no', 'number', 'text', 'multiple_choice']);
const ANAMNESIS_OPTION_TYPES = new Set(['select', 'radio', 'checkbox']);

export function isFormValuePresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function findMissingRequiredField(fields, responses) {
  return fields.find((field) => field.is_required && !isFormValuePresent(responses[field.id])) || null;
}

export function calculateCheckinScore(fields, responses) {
  return fields.reduce((score, field) => {
    const weight = Number(field.score_weight ?? 1);
    if (!Number.isFinite(weight) || weight < 0) return score;

    const answer = responses[field.id];
    let normalized = 0;
    if (field.field_type === 'scale_1_10') normalized = Math.min(10, Math.max(0, Number(Array.isArray(answer) ? answer[0] : answer) || 0));
    else if (field.field_type === 'yes_no') normalized = answer === 'yes' ? 10 : 0;
    else normalized = isFormValuePresent(answer) ? 10 : 0;

    return {
      total: score.total + (weight * normalized),
      maximum: score.maximum + (weight * 10),
    };
  }, { total: 0, maximum: 0 });
}

export function validateCheckinTemplate({ name, fields, channel = 'in_app' }) {
  if (!String(name || '').trim()) return 'Dê um nome ao check-in.';
  if (channel !== 'in_app') return 'Use o canal App Nello enquanto os disparos externos não estiverem disponíveis.';
  if (!Array.isArray(fields) || fields.length === 0) return 'Adicione pelo menos uma pergunta ao check-in.';

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const position = index + 1;
    if (!String(field.label || '').trim()) return `Preencha o texto da pergunta ${position}.`;
    if (!CHECKIN_FIELD_TYPES.has(field.field_type)) return `O tipo da pergunta ${position} ainda não está disponível.`;

    const weight = Number(field.score_weight);
    if (!Number.isFinite(weight) || weight < 0) return `Informe um peso válido na pergunta ${position}.`;

    if (field.field_type === 'multiple_choice') {
      const options = (field.options || []).map((option) => String(option).trim()).filter(Boolean);
      if (new Set(options).size < 2) return `Adicione pelo menos duas opções diferentes na pergunta ${position}.`;
    }
  }

  return null;
}

export function validateAnamnesisTemplate({ title, sections }) {
  if (!String(title || '').trim()) return 'Dê um nome ao formulário.';
  if (!Array.isArray(sections) || sections.length === 0) return 'Adicione pelo menos uma seção ao formulário.';

  const allFields = sections.flatMap((section) => section.fields || []);
  const fieldIds = new Set(allFields.map((field) => field.id).filter(Boolean));
  if (fieldIds.size !== allFields.length) return 'Cada pergunta precisa ter um identificador único.';

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const sectionPosition = sectionIndex + 1;
    if (!String(section.title || '').trim()) return `Dê um nome à seção ${sectionPosition}.`;
    if (!Array.isArray(section.fields) || section.fields.length === 0) return `Adicione uma pergunta à seção ${sectionPosition}.`;

    for (let fieldIndex = 0; fieldIndex < section.fields.length; fieldIndex += 1) {
      const field = section.fields[fieldIndex];
      const label = `pergunta ${fieldIndex + 1} da seção ${sectionPosition}`;
      if (!String(field.label || '').trim()) return `Preencha o texto da ${label}.`;

      if (ANAMNESIS_OPTION_TYPES.has(field.type)) {
        const options = (field.options || [])
          .map((option) => ({ label: String(option?.label || '').trim(), value: String(option?.value || '').trim() }))
          .filter((option) => option.label && option.value);
        if (new Set(options.map((option) => option.value)).size < 2) return `Adicione pelo menos duas opções válidas na ${label}.`;
      }

      if (field.conditional_logic) {
        const dependency = field.conditional_logic.field_id;
        if (!dependency || dependency === field.id || !fieldIds.has(dependency)) {
          return `Revise a condição configurada na ${label}.`;
        }
      }
    }
  }

  return null;
}

export function cloneAnamnesisSections(sections, createId = () => crypto.randomUUID()) {
  const source = Array.isArray(sections) ? sections : [];
  const fieldIdMap = new Map();

  source.forEach((section) => {
    (section.fields || []).forEach((field) => {
      if (field.id) fieldIdMap.set(field.id, createId());
    });
  });

  return source.map((section) => ({
    ...section,
    id: createId(),
    fields: (section.fields || []).map((field) => ({
      ...field,
      id: fieldIdMap.get(field.id) || createId(),
      ...(field.conditional_logic ? {
        conditional_logic: {
          ...field.conditional_logic,
          field_id: fieldIdMap.get(field.conditional_logic.field_id) || field.conditional_logic.field_id,
        },
      } : {}),
    })),
  }));
}
