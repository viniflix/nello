import { z } from 'zod';
import { entityId } from '../contracts';
export const messageIntentSchema = z.object({ conversationId: entityId, nonce: z.string().uuid(), kind: z.enum(['text', 'image', 'audio', 'video', 'file']) }).strict();
export type MessageIntent = z.infer<typeof messageIntentSchema>;
