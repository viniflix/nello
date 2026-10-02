import { hasAnalyticsConsent } from '@/features/privacy/consent';

let client;
let loading;
const posthog = {
  get __loaded() { return client?.__loaded; },
  get initialized() { return client?.initialized; },
  has_opted_out_capturing: () => !hasAnalyticsConsent() || (client?.has_opted_out_capturing?.() ?? true),
  async init(key, options) {
    if (!hasAnalyticsConsent()) return;
    loading ||= import('posthog-js').then(module => module.default).catch(error => { loading = null; throw error; });
    const loaded = await loading;
    // Consent may have been revoked while the optional module was downloading.
    if (!hasAnalyticsConsent()) return;
    client = loaded;
    if (!client.__loaded && !client.initialized) client.init(key, options);
  },
  get_session_id: () => client?.get_session_id?.(),
  identify: (...args) => { if (hasAnalyticsConsent()) client?.identify(...args); },
  capture: (...args) => { if (hasAnalyticsConsent()) client?.capture(...args); },
  reset: (...args) => client?.reset(...args),
  opt_in_capturing: (...args) => { if (hasAnalyticsConsent()) client?.opt_in_capturing?.(...args); },
  opt_out_capturing: (...args) => client?.opt_out_capturing?.(...args),
};
export default posthog;
