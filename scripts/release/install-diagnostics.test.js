import { describe, expect, it } from 'vitest';
import { summarizeNpmLog } from './install-diagnostics.mjs';

describe('npm installation failure diagnostics', () => {
  it('captures versions, failed requests and unfinished package extraction', () => {
    const result = summarizeNpmLog(`0 info using npm@11.5.2
1 info using node@22.18.0
2 http fetch GET 502 https://registry.npmjs.org/vite/-/vite-7.3.6.tgz 72000ms
3 error code ECONNRESET
4 error Exit handler never called!
5 silly unfinished npm timer reify:unpack:node_modules/vite 123456`);
    expect(result.versions).toEqual(['npm@11.5.2', 'node@22.18.0']);
    expect(result.failures).toEqual(['ECONNRESET', 'Exit handler never called']);
    expect(result.requests[0].status).toBe(502);
    expect(result.unfinished).toEqual(['reify:unpack:node_modules/vite']);
  });
  it('does not disclose credentials, private paths, query strings or arbitrary log text', () => {
    const result = JSON.stringify(summarizeNpmLog(`0 http fetch GET 401 https://user:secret@private.example/team-secret/package?token=secret 10ms
1 http fetch GET 200 https://registry.npmjs.org/vite?token=secret 10ms
2 verbose config _authToken=secret
3 error Request headers Authorization Bearer secret
4 verbose stack secret`));
    expect(result).not.toContain('secret');
    expect(result).not.toContain('user:');
    expect(result).toContain('[redacted]');
    expect(result).toContain('/vite');
  });
  it('bounds verbose installation diagnostics', () => {
    const result = summarizeNpmLog(Array.from({length: 300}, (_, i) => `${i} http fetch GET 200 https://registry.npmjs.org/package-${i} 1ms`).join('\n'));
    expect(result.requests).toHaveLength(25);
    expect(result.requests[0].packagePath).toBe('/package-275');
  });
});
