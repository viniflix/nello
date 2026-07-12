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

const normalizeString = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const normalizeProgressiveProfilePayload = (profile) => {
  const normalized = {};
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'address' && value && typeof value === 'object') {
      normalized.address = Object.fromEntries(
        Object.entries(value).map(([addressKey, addressValue]) => [addressKey, normalizeString(addressValue)]),
      );
    } else {
      normalized[key] = normalizeString(value);
    }
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
