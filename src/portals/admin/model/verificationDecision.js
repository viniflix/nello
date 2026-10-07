export function validateVerificationQueue(data) {
  if (data?.schema_version !== 1 || typeof data.can_write !== 'boolean'
    || !Number.isFinite(Date.parse(data.generated_at)) || typeof data.source !== 'string'
    || !Number.isSafeInteger(data.page) || data.page < 1 || data.page_size !== 20
    || !Number.isSafeInteger(data.total) || data.total < 0 || !Array.isArray(data.items) || data.items.length > 20
    || data.items.length > data.total) throw new Error('invalid_verification_queue');
  const ids = new Set();
  for (const row of data.items) {
    if (!row || typeof row.id !== 'string' || ids.has(row.id) || !Number.isFinite(Date.parse(row.updated_at))
      || !['nutritionist', 'student'].includes(row.professional_role)
      || !['not_submitted', 'pending', 'needs_information', 'approved', 'rejected', 'expired', 'suspended'].includes(row.status)) throw new Error('invalid_verification_queue');
    ids.add(row.id);
  }
  return data;
}

export function verificationDecision({ verification, decision, reason, sourceUrl, validUntil }, now = Date.now()) {
  if (!verification?.updated_at || !Number.isFinite(Date.parse(verification.updated_at))) throw new Error('Atualize a fila antes de decidir.');
  const allowed = verification.status === 'pending' ? ['approved', 'rejected', 'needs_information'] : verification.status === 'approved' ? ['suspended'] : [];
  if (!allowed.includes(decision)) throw new Error('Este estado permite somente consulta. Aguarde um novo envio do profissional.');
  const justification = reason?.trim() || '';
  if (justification.length < 5 || justification.length > 500) throw new Error('Informe uma justificativa de 5 a 500 caracteres.');
  let source = null;
  let validity = null;
  if (decision === 'approved') {
    try {
      source = sourceUrl?.trim();
      const url = new URL(source);
      if (url.protocol !== 'https:' || url.username || url.password || source.length > 1000 || /[\p{Cc}\s]/u.test(source)) throw new Error();
    } catch { throw new Error('Informe o endereço HTTPS da fonte consultada, sem credenciais.'); }
    const day = /^\d{4}-\d{2}-\d{2}$/.test(validUntil || '') ? new Date(`${validUntil}T12:00:00Z`) : null;
    if (!day || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== validUntil) throw new Error('Informe uma data de validade válida.');
    validity = new Date(`${validUntil}T23:59:59-03:00`).toISOString();
    const maximumDays = verification.professional_role === 'student' ? 190 : 370;
    if (Date.parse(validity) <= now || Date.parse(validity) > now + maximumDays * 86400000) throw new Error(`A validade deve ser futura e de até ${maximumDays} dias.`);
  }
  return { verificationId: verification.id, expected: verification.updated_at, decision, reason: justification, sourceUrl: source, validUntil: validity };
}
