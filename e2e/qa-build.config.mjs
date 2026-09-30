import {defineConfig} from 'vite';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw Error('QA renderer runs on the isolated remote runner only');
export default defineConfig({build:{outDir:'.backend-ci/qa-assets',emptyOutDir:true,lib:{entry:'e2e/qa-browser-entry.js',formats:['es'],fileName:()=> 'harness.js'}}});
