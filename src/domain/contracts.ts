import { z } from 'zod';

export const domainNames = ['identity', 'patient', 'clinical', 'nutrition', 'agenda', 'finance', 'files', 'communication'] as const;
export type DomainName = typeof domainNames[number];
export const entityId = z.union([z.string().min(1).max(128), z.number().int().positive().safe()]);
export const revision = z.number().int().nonnegative().safe();
export const finiteNonnegative = z.number().finite().nonnegative();
export const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export class ContractError extends Error {
  readonly code = 'INVALID_CONTRACT';
  constructor() { super('Contrato de operação inválido.'); this.name = 'ContractError'; }
}
/** Validation errors deliberately omit payloads, fields and clinical text. */
export function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ContractError();
  return parsed.data;
}
