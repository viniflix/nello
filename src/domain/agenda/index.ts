import { z } from 'zod';
import { civilDate, entityId } from '../contracts';
export const appointmentSchema = z.object({ patientId: entityId, date: civilDate, time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), durationMinutes: z.number().int().positive().max(1440) }).strict();
export type Appointment = z.infer<typeof appointmentSchema>;
