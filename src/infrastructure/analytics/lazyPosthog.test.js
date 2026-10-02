import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ consent: false, sdk: { init: vi.fn(), capture: vi.fn(), identify: vi.fn(), opt_out_capturing: vi.fn(), reset: vi.fn() } }));
vi.mock('@/features/privacy/consent', () => ({hasAnalyticsConsent: () => mocks.consent}));
vi.mock('posthog-js', () => ({default: mocks.sdk}));
describe('optional analytics loading', () => {
  beforeEach(() => {vi.resetModules();vi.clearAllMocks();mocks.consent=false;});
  it('does not initialize or capture without consent', async () => {
    const {default: client}=await import('./lazyPosthog');
    await client.init('synthetic',{});client.capture('x');
    expect(mocks.sdk.init).not.toHaveBeenCalled();expect(mocks.sdk.capture).not.toHaveBeenCalled();
  });
  it('rechecks consent after the asynchronous module load', async () => {
    const {default: client}=await import('./lazyPosthog');mocks.consent=true;
    const pending=client.init('synthetic',{});mocks.consent=false;await pending;
    expect(mocks.sdk.init).not.toHaveBeenCalled();
    mocks.consent=true;await client.init('synthetic',{});client.capture('x');
    expect(mocks.sdk.capture).toHaveBeenCalledWith('x');
    mocks.consent=false;client.capture('y');client.opt_out_capturing();client.reset();
    expect(mocks.sdk.capture).toHaveBeenCalledTimes(1);expect(mocks.sdk.reset).toHaveBeenCalled();
  });
});
