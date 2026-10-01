// Call sites provide reviewed technical IDs; never normalize arbitrary runtime text.
export function queryOperation(context) {
  return /^[a-z0-9_.:-]{1,120}$/i.test(context || '') ? context : 'unknown_operation';
}
