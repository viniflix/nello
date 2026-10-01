import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { createBuildPolicy } from './build/viteBuildPolicy.js';

const buildPolicy = createBuildPolicy(process.env);
const appRelease = process.env.VERCEL_GIT_COMMIT_SHA
	|| process.env.VITE_APP_RELEASE
	|| process.env.npm_package_version
	|| 'development';

export default defineConfig({
	define: {
		'import.meta.env.VITE_APP_RELEASE': JSON.stringify(appRelease),
	},
	plugins: [
		react(),
		...(buildPolicy.sentryPluginOptions
			? [sentryVitePlugin(buildPolicy.sentryPluginOptions)]
			: []),
	],
	server: {
		headers: {
			'Cross-Origin-Embedder-Policy': 'credentialless',
		},
	},
	resolve: {
		extensions: ['.jsx', '.js', '.tsx', '.ts', '.json', ],
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	build: {
		...buildPolicy.build,
		rollupOptions: {
			external: [
				'@babel/parser',
				'@babel/traverse',
				'@babel/generator',
				'@babel/types'
			]
		}
	},
	test: {
  // Bound jsdom workers to avoid resource contention in local and CI validation.
  maxWorkers: 4,
		coverage: {
 provider: 'v8',
 include: ['src/lib/utils/energy-*.js','src/lib/utils/dri-energy.js','src/lib/utils/nutrition-calculations.js','src/features/auth/authFlows.js','src/lib/utils/authRedirect.js','src/features/clinical-records/model/attachmentSchema.js','supabase/functions/confirm-document-asset/assetValidation.ts'],
 exclude: ['**/*.test.js'],
 reporter: ['text','json-summary'],
 thresholds: { perFile: true, lines: 90, statements: 90, functions: 90, branches: 85 },
},
 globals: true,
		include: ['{src,build,scripts}/**/*.{test,spec}.{js,jsx,ts,tsx}'],
		environment: 'jsdom',
		setupFiles: ['./src/__tests__/setup.js'],
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	}
});
