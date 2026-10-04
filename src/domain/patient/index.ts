import { z } from 'zod';
import { entityId, revision } from '../contracts';
export const patientContextSchema = z.object({ patientId: entityId, episodeId: entityId.nullable(), revision }).strict();
export type PatientContext = z.infer<typeof patientContextSchema>;
