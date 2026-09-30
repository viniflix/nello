import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../scripts/qa/isolated-runtime.mjs';
import {defineConfig} from 'vite';
assertIsolatedRuntime();
export default defineConfig({build:{outDir:'.backend-ci/qa-assets',emptyOutDir:true,lib:{entry:'e2e/qa-browser-entry.js',formats:['es'],fileName:()=> 'harness.js'}}});
