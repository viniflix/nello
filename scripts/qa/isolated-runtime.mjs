import {existsSync} from 'node:fs';
import path from 'node:path';
export function assertIsolatedRuntime(environment=process.env){
 if(environment.CI==='true'&&environment.GITHUB_ACTIONS==='true')return 'github';
 if(environment.NELLO_LOCAL_QA==='isolated'){
  if(existsSync('.backend-ci/supabase/.temp/project-ref'))throw Error('Refusing a linked QA workdir');
  return 'local';
 }
 throw Error('An isolated GitHub runner or explicit NELLO_LOCAL_QA=isolated is required');
}
export const supabaseCommand=process.platform==='win32'?path.resolve('node_modules/@supabase/cli-windows-x64/bin/supabase.exe'):'npx';
export const supabaseArgs=args=>process.platform==='win32'?args:['--no-install','supabase',...args];
