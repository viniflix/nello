export {renderCanonicalDocumentPdf} from '../src/features/documents/pdf/render-canonical-document.js';
export {uploadVerifiedFile} from '../src/lib/storage/verifiedUpload';
import posthog, { identifyUser, resetUser, track } from '../src/infrastructure/analytics/posthog';
import { createPosthogOptions } from '../src/app/config/posthog';
import { bindConsentOwner, storeAnalyticsChoice } from '../src/features/privacy/consent';
export async function syntheticAnalyticsTransport() {
  const first = '9ba45c9b-d0d4-490d-96a0-6addd7826833';
  const second = '1ba45c9b-d0d4-490d-96a0-6addd7826833';
  bindConsentOwner(first); storeAnalyticsChoice(true);
  await posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    ...createPosthogOptions(import.meta.env), api_host: window.location.origin,
    request_batching: false, persistence: 'memory', capture_pageview: false, capture_pageleave: false,
    // Only this disposable fixture bypasses the SDK's automation filter.
    opt_out_useragent_filter: true,
  });
  posthog.opt_in_capturing({ captureEventName: false, enable_persistence: false });
  identifyUser({ id: first, profile: { user_type: 'patient' } });
  track('operation_failed', { correlation_id: first, operation: 'qa.transport', payload: 'PRIVATE_SYNTHETIC_SENTINEL' });
  resetUser();
  bindConsentOwner(second); storeAnalyticsChoice(true);
  posthog.opt_in_capturing({ captureEventName: false, enable_persistence: false });
  identifyUser({ id: second, profile: { user_type: 'nutritionist' } });
  track('operation_failed', { correlation_id: second, operation: 'qa.transport', payload: 'PRIVATE_SYNTHETIC_SENTINEL' });
  return { loaded: posthog.__loaded };
}

export async function syntheticAnalyticsPrivacyBoundary() {
  bindConsentOwner('wave04-privacy-probe'); storeAnalyticsChoice(false);
  posthog.capture('qa_default_denied');
  storeAnalyticsChoice(true);
  await posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    ...createPosthogOptions(import.meta.env), api_host: window.location.origin,
    request_batching: false, persistence: 'memory', capture_pageview: false, capture_pageleave: false,
    opt_out_useragent_filter: true,
  });
  posthog.opt_in_capturing({ captureEventName: false, enable_persistence: false });
  posthog.capture('qa_explicit_grant', { payload: 'PRIVATE_SYNTHETIC_SENTINEL' });
  storeAnalyticsChoice(false); posthog.opt_out_capturing();
  posthog.capture('qa_revoked_denied');
  return { optedOut: posthog.has_opted_out_capturing() };
}
