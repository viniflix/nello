import { z } from 'zod';
export const actorSchema = z.object({ id: z.string().uuid(), role: z.enum(['patient', 'nutritionist', 'admin']) }).strict();
export type Actor = z.infer<typeof actorSchema>;
export { normalizeAuthEmail } from './normalization';
/** No access decision is granted by this model; the server authorizes every operation. */
export function sameActor(expected: string, current: string | null | undefined): boolean { return Boolean(expected && expected === current); }
