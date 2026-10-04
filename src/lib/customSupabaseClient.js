// Compatibility adapter. New code must import from '@/infrastructure/supabase/client'.
import { track } from '@/infrastructure/analytics/posthog';
// Retained for unknown older consumers; consent-gated, payload-free usage signal.
track('ui_action_outcome', {operation:'legacy_supabase_adapter',source:'compatibility',outcome:'started'});
export { supabase } from '@/infrastructure/supabase/client';
