import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { verifyHostedAuth, verifyIsolatedAuth } from './auth-contract.mjs';

const contract = JSON.parse(readFileSync('operations/backend/auth-contract.json', 'utf8'));
const config = readFileSync('supabase/config.toml', 'utf8');

describe('Auth environment restoration boundaries', () => {
  it('keeps the current production contract separate from historical/local settings', () => {
    const production = JSON.parse(readFileSync('operations/backend/production-auth-contract.json', 'utf8'));
    expect(() => verifyHostedAuth(production.hosted, production)).not.toThrow();
    expect(production.hosted.security_captcha_enabled).toBe(true);
    expect(production.hosted.uri_allow_list).toBe('https://nellonutri.com.br/**,https://www.nellonutri.com.br/**');
    expect(() => verifyHostedAuth({ ...production.hosted, uri_allow_list: contract.hosted.uri_allow_list }, production)).toThrow('uri_allow_list');
    expect(() => verifyHostedAuth({ ...production.hosted, security_captcha_enabled: false }, production)).toThrow('security_captcha_enabled');
  });
  it('accepts the recorded hosted configuration and isolated runtime configuration', () => {
    expect(() => verifyHostedAuth(contract.hosted, contract)).not.toThrow();
    expect(() => verifyIsolatedAuth(config, contract)).not.toThrow();
  });
  it.each(['mailer_autoconfirm', 'mfa_totp_enroll_enabled', 'mfa_totp_verify_enabled'])('rejects hosted security drift in %s', key => {
    expect(() => verifyHostedAuth({ ...contract.hosted, [key]: !contract.hosted[key] }, contract)).toThrow(key);
  });
  it('rejects missing fields instead of assuming safe defaults', () => {
    expect(() => verifyHostedAuth({}, contract)).toThrow('site_url');
  });
  it.each([
    ['enable_confirmations = true', 'enable_confirmations = false'],
    ['verify_enabled = true', 'verify_enabled = false'],
    ['enable_anonymous_sign_ins = false', 'enable_anonymous_sign_ins = true'],
    ['verify_jwt = true', 'verify_jwt = false'],
  ])('blocks a restored config that changes %s', (before, after) => {
    expect(() => verifyIsolatedAuth(config.replace(before, after), contract)).toThrow();
  });
});
