import { z } from 'zod';
import { domainNames, entityId, revision, parseContract } from './contracts';

/** Future native transport contract, not a new offline write queue. */
export const syncPolicy = Object.freeze({ version: 1, clinicalOfflineStorage: false, automaticReplay: false, authRequired: true, conflictStrategy: 'server_revision' });
export const syncReceiptSchema = z.object({ version: z.literal(1), actorId: z.string().uuid(), domain: z.enum(domainNames), entityId, revision, nonce: z.string().uuid(), outcome: z.enum(['confirmed', 'conflict', 'unknown']) }).strict();
export type SyncReceipt = z.infer<typeof syncReceiptSchema>;
export function acceptSyncReceipt(value: unknown, actorId: string, minimumRevision: number): SyncReceipt {
  parseContract(revision, minimumRevision);
  const receipt = parseContract(syncReceiptSchema, value);
  if (receipt.actorId !== actorId) throw new Error('SESSION_CHANGED');
  if (receipt.revision < minimumRevision) throw new Error('STALE_REVISION');
  return receipt;
}
