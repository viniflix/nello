import { describe, expect, it } from 'vitest';
import { createBuildPolicy } from './viteBuildPolicy';

describe('createBuildPolicy', () => {
  it('minifies without producing public source maps when upload is unavailable', () => {
    expect(createBuildPolicy({})).toEqual({
      build: { minify: 'esbuild', sourcemap: false },
      sentryPluginOptions: null,
    });
  });

  it('creates hidden source maps and removes them after an authenticated upload', () => {
    expect(createBuildPolicy({
      SENTRY_AUTH_TOKEN: 'token',
      SENTRY_ORG: 'nello-org',
      SENTRY_PROJECT: 'nello-web',
    })).toEqual({
      build: { minify: 'esbuild', sourcemap: 'hidden' },
      sentryPluginOptions: {
        org: 'nello-org',
        project: 'nello-web',
        authToken: 'token',
        telemetry: false,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      },
    });
  });
});
