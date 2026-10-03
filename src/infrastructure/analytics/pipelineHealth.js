import { captureException } from '@sentry/react';
const reports = new Map();
const reasons = new Set(['unknown_event','invalid_properties','invalid_property','sdk_failure','invalid_release']);
export function reportAnalyticsFailure(reason, now = Date.now()) {
 const safe = reasons.has(reason) ? reason : 'sdk_failure';
 if (reports.has(safe) && now >= reports.get(safe) && now - reports.get(safe) < 60000) return false;
 reports.set(safe,now);
 // Independent of the failing analytics SDK, with no original error or payload.
 try { captureException(new Error(`analytics_delivery failed (${safe})`),{tags:{'error.source':'analytics','error.reason':safe},fingerprint:['analytics-pipeline',safe]}); } catch { /* Monitoring must never interrupt a clinical save. */ }
 return true;
}
