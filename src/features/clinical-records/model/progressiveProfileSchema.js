import { z } from 'zod';

const optionalString = z.string().optional();
const optionalEmail = z.union([z.literal(''), z.email()]).optional();
const addressSchema = z.object({
  street: optionalString,
  city: optionalString,
  state: optionalString,
  postal_code: optionalString,
}).optional();

export const progressiveProfileSchema = z.object({
  name: z.string().trim().min(2),
  email: optionalEmail,
  phone: optionalString,
  birth_date: optionalString,
  occupation: optionalString,
  civil_status: optionalString,
  gender: z.enum(['male', 'female', 'other', 'not_informed', '']).optional(),
  address: addressSchema,
});

export const progressiveProfileCommandSchema = progressiveProfileSchema.partial();

const PROFILE_FIELDS = ['name', 'email', 'phone', 'birth_date', 'occupation', 'civil_status', 'gender', 'address'];
const ADDRESS_FIELDS = ['street', 'city', 'state', 'postal_code'];

const normalizeString = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const normalizeProgressiveProfilePayload = (profile) => {
  const parsed = progressiveProfileCommandSchema.parse(profile);
  const normalized = {};
  for (const key of PROFILE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
    const value = parsed[key];
    if (value === undefined) continue;
    if (key === 'address') {
      normalized.address = {};
      for (const addressKey of ADDRESS_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(value, addressKey)) {
          normalized.address[addressKey] = normalizeString(value[addressKey]);
        }
      }
    } else {
      normalized[key] = normalizeString(value);
    }
  }
  if (Object.keys(normalized).length === 0) {
    throw new Error('profile_changes_required');
  }
  return normalized;
};

export const getContextualProfileRequirements = (profile = {}, context = {}) => {
  const requirements = [];
  if ((context.ageBasedProtocol || context.isMinor) && !profile.birth_date) {
    requirements.push('birth_date');
  }
  if (context.isMinor && !context.legalGuardians?.some(({ status }) => status === 'active')) {
    requirements.push('legal_guardian');
  }
  return requirements;
};
