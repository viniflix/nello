import {it,expect,vi} from 'vitest';
import {reportAnalyticsFailure} from './pipelineHealth';
const capture=vi.hoisted(()=>vi.fn());vi.mock('@sentry/react',()=>({captureException:capture}));
it('reports independently with bounded repetition and no untrusted error text',()=>{
 expect(reportAnalyticsFailure('sdk_failure',1000)).toBe(true);
 expect(reportAnalyticsFailure('sdk_failure',2000)).toBe(false);
 expect(reportAnalyticsFailure('sdk_failure',62000)).toBe(true);
 expect(capture).toHaveBeenCalledTimes(2);
 expect(capture.mock.calls[0][0].message).toBe('analytics_delivery failed (sdk_failure)');
});
it('never fails a clinical operation when monitoring also fails',()=>{
 capture.mockImplementationOnce(()=>{throw Error('private backend payload');});
 expect(()=>reportAnalyticsFailure('invalid_release',1000)).not.toThrow();
});
