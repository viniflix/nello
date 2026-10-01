import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../scripts/qa/isolated-runtime.mjs';
import {defineConfig} from 'vite';
import path from 'node:path';
assertIsolatedRuntime();
process.env.VITE_PUBLIC_POSTHOG_KEY = 'phc_nello_synthetic_telemetry';
export default defineConfig({resolve:{alias:{'@':path.resolve('src')}},define:{'import.meta.env.VITE_PUBLIC_POSTHOG_KEY':JSON.stringify('phc_nello_synthetic_telemetry')},build:{outDir:'.backend-ci/qa-assets',emptyOutDir:true,lib:{entry:'e2e/qa-browser-entry.js',formats:['es'],fileName:()=> 'harness.js'}}});
