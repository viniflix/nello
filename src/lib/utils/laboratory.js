/** Decimal input has no grouping separators. Qualitative results remain text. */
export function laboratoryNumber(raw) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return { kind: 'missing', value: null };
  if (typeof raw !== 'string' && typeof raw !== 'number') return { kind: 'invalid', value: null };
  const text = String(raw).trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return { kind: 'invalid', value: null };
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
    ? { kind: 'number', value } : { kind: 'invalid', value: null };
}

// Typography only, never a concentration/unit conversion. Preserve numerator case.
export function laboratoryUnit(raw) {
  return String(raw || '').trim().replace(/\s+/g, '').replace(/[µμ]/g, 'u')
    .replace(/\/(?:dL|dl|DL|Dl)$/, '/dl').replace(/\/(?:mL|ml)$/, '/ml').replace(/\/L$/, '/l');
}

export function laboratoryReference(testValue, refMin, refMax) {
  const result = laboratoryNumber(testValue), min = laboratoryNumber(refMin), max = laboratoryNumber(refMax);
  const invalid = min.kind === 'invalid' || max.kind === 'invalid'
    || (min.kind === 'number' && max.kind === 'number' && min.value > max.value);
  if (result.kind !== 'number' || invalid) return 'pending';
  if (min.kind === 'number' && result.value < min.value) return 'low';
  if (max.kind === 'number' && result.value > max.value) return 'high';
  return min.kind === 'number' && max.kind === 'number' ? 'normal' : 'pending';
}

/** Normalize only supplied fields; never mutate historical snapshots or originals. */
export function laboratoryPayload(payload, current) {
  const next = { ...payload };
  for (const key of ['test_value', 'reference_min', 'reference_max']) {
    if (!Object.hasOwn(payload, key)) continue;
    const parsed = laboratoryNumber(payload[key]);
    if (key !== 'test_value' && parsed.kind === 'invalid') throw new Error('Informe referências numéricas válidas, sem separadores de milhar.');
    next[key] = parsed.kind === 'missing' ? null : parsed.kind === 'number'
      ? key === 'test_value' ? String(parsed.value) : parsed.value : String(payload[key]).trim();
    // The existing revision RPC interprets null as "retain previous value".
    // Refuse an unsupported removal instead of acknowledging a save it cannot do.
    if (current?.[key] != null && next[key] === null) {
      throw new Error('Não é possível retirar valores nesta revisão. Invalide o exame e registre o laudo novamente para preservar o histórico.');
    }
  }
  const merged = { ...current, ...next };
  const min = laboratoryNumber(merged.reference_min), max = laboratoryNumber(merged.reference_max);
  if (min.kind === 'number' && max.kind === 'number' && min.value > max.value) throw new Error('Referência mínima não pode ser maior que a máxima.');
  next.status = laboratoryReference(merged.test_value, merged.reference_min, merged.reference_max);
  return next;
}

export function laboratoryTrend(latest, previous) {
  const a = laboratoryNumber(latest?.test_value), b = laboratoryNumber(previous?.test_value);
  const unit = laboratoryUnit(latest?.test_unit);
  if (!previous || a.kind !== 'number' || b.kind !== 'number' || !unit || unit !== laboratoryUnit(previous.test_unit)) {
    return { latest, previous, direction: 'unknown', delta: null };
  }
  const delta = a.value - b.value;
  return { latest, previous, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable', delta };
}
