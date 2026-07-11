export function createBuildPolicy(env) {
  if (!env.SENTRY_AUTH_TOKEN) {
    return {
      build: { minify: 'esbuild', sourcemap: false },
      sentryPluginOptions: null,
    };
  }

  return {
    build: { minify: 'esbuild', sourcemap: 'hidden' },
    sentryPluginOptions: {
      org: env.SENTRY_ORG || 'nello',
      project: env.SENTRY_PROJECT || 'javascript-react',
      authToken: env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    },
  };
}
