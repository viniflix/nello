import { z } from 'zod';
import { entityId, revision } from '../contracts';
import { visibilitySchema } from './evolution';
export const clinicalOperationSchema = z.object({ recordId: entityId, expectedRevision: revision, visibility: visibilitySchema }).strict();
export { evolutionContentSchema, retrospectiveReasonSchema, visibilitySchema, isContentMinimallyValid, getMeaningfulClinicalText } from './evolution';
export { confirmedAnamnesisStatuses, isConfirmedAnamnesis } from './status';
// Reference arithmetic remains the same pure engine used by the Edge clinical worker.
export { decimalFraction, exactOperation, fractionNumber } from '../../../supabase/functions/_shared/clinical-arithmetic.js';
