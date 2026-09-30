// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveConfig } from 'vite';
import { interceptorPlugin } from '@vitest/mocker/node';
import path from 'node:path';

describe('development boundaries and diagnostics', () => {
  it('retains warnings and PostCSS diagnostics and restores host/origin checks without listening', async () => {
    const warn = console.warn;
    const config = await resolveConfig({}, 'serve');
    expect(console.warn).toBe(warn);
    expect(config.server.allowedHosts).not.toBe(true);
    expect(config.server.cors).not.toBe(true);
    expect(config.server.cors.origin.test('http://localhost:4173')).toBe(true);
    expect(config.server.cors.origin.test('https://untrusted.example.invalid')).toBe(false);
    expect(config.preview.allowedHosts).not.toBe(true);
    expect(config.preview.cors).not.toBe(true);
    expect(config.plugins.some(p => p.name === 'add-transform-index-html')).toBe(false);
    expect(config.customLogger).toBeUndefined();
  });

  it('rejects redirect mocks outside the allowlist and denied files, preserving permitted mocks', async () => {
    const config = await resolveConfig({}, 'serve');
    const registrations = [];
    const handlers = new Map();
    const plugin = interceptorPlugin({ registry: {
      register: event => registrations.push(event), delete() {}, clear() {},
    } });
    plugin.configureServer({ config, ws: { on: (name, handler) => handlers.set(name, handler), send() {} } });
    const register = handlers.get('vitest:interceptor:register');
    for (const redirect of ['opaque:../../outside-secret', 'file:///.env']) {
      register({ type: 'redirect', raw: 'qa', url: '/qa', redirect });
    }
    expect(registrations).toHaveLength(0);
    register({ type: 'redirect', raw: 'qa', url: '/qa', redirect: 'file:///package.json' });
    expect(registrations).toHaveLength(1);
    expect(path.resolve(registrations[0].redirect)).toBe(path.resolve(config.root, 'package.json'));
  });
});
