import { hasAnalyticsConsent } from '@/features/privacy/consent';

let client;
let loading;
let pendingIdentity;
let generation = 0;
let pendingCaptures = [];
const posthog = {
  get __loaded() { return client?.__loaded; },
  get initialized() { return client?.initialized; },
  has_opted_out_capturing: () => !hasAnalyticsConsent() || (client?.has_opted_out_capturing?.() ?? true),
  async init(key, options) {
    if (!hasAnalyticsConsent()) return;
    const startedGeneration = generation;
    loading ||= import('posthog-js').then(module => module.default).catch(error => { loading = null; throw error; });
    const loaded = await loading;
    // Consent may have been revoked while the optional module was downloading.
    if (!hasAnalyticsConsent() || startedGeneration !== generation) return;
    client = loaded;
    if (!client.__loaded && !client.initialized) client.init(key, options);
    if (pendingIdentity) { client.identify(...pendingIdentity); pendingIdentity = null; }
    for(const args of pendingCaptures) { if(hasAnalyticsConsent())client.capture(...args); }
    pendingCaptures=[];
  },
  get_session_id: () => client?.get_session_id?.(),
  identify: (...args) => { if (hasAnalyticsConsent()) { if(client) client.identify(...args); else pendingIdentity=args; } },
  capture: (...args) => { if (hasAnalyticsConsent()) { if(client) client.capture(...args); else { if(pendingCaptures.length>=20)pendingCaptures.shift();pendingCaptures.push(args); } } },
  reset: (...args) => { generation++; pendingIdentity=null; pendingCaptures=[]; return client?.reset(...args); },
  opt_in_capturing: (...args) => { if (hasAnalyticsConsent()) client?.opt_in_capturing?.(...args); },
  opt_out_capturing: (...args) => client?.opt_out_capturing?.(...args),
};
export default posthog;
