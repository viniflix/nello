import { parseClinicalNumber } from '../../../supabase/functions/_shared/clinical-energy.js';
/** Reject partial strings and decimal inputs that Number would silently truncate. */
export function parseFiniteEnergyNumber(value) {
  return parseClinicalNumber(value);
}
