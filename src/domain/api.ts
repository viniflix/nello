import { z } from 'zod';
import { parseContract } from './contracts';

export const API_VERSION = 1;
const argsSchema = z.record(z.string(), z.unknown());
const version = z.literal(1);
const mutation = z.object({ p_table: z.string().min(1), p_values: argsSchema, p_id: z.string().nullable(), p_expected: z.unknown().optional() }).strict();
export const operationSchema = z.discriminatedUnion('operation', [
  z.object({ version, operation: z.literal('record.insert'), args: mutation.extend({p_id:z.null()}) }).strict(),
  z.object({ version, operation: z.literal('record.update'), args: mutation.extend({p_id:z.string().min(1)}) }).strict(),
  z.object({ version, operation: z.literal('clinical.perform'), args: z.object({p_operation:z.string().min(1),p_arguments:argsSchema,p_expected:z.unknown().optional()}).strict() }).strict(),
  z.object({ version, operation: z.literal('nutrition.meal.save'), args: z.object({p_plan_id:z.union([z.string().min(1),z.number().int().positive()]),p_meal_id:z.union([z.string(),z.number()]).nullish(),p_meal:argsSchema,p_expected:z.unknown().optional()}).strict() }).strict(),
]);
export type Operation = z.infer<typeof operationSchema>;
export type RpcTransport<T> = (rpc: string, args: Record<string, unknown>) => Promise<T>;
/** v1 client contract uses the existing server-authorized transactional RPCs unchanged. */
export function toRpcRequest(value: unknown): { name: string; args: Record<string, unknown> } {
  const operation = parseContract(operationSchema, value);
  const names: Record<Operation['operation'], string> = {
    'record.insert': 'mutate_record_idempotently', 'record.update': 'mutate_record_idempotently',
    'clinical.perform': 'perform_clinical_operation', 'nutrition.meal.save': 'save_draft_meal',
  };
  return { name: names[operation.operation], args: operation.args };
}
export async function executeOperation<T>(transport: RpcTransport<T>, value: unknown): Promise<T> {
  const request = toRpcRequest(value);
  return transport(request.name, request.args);
}
