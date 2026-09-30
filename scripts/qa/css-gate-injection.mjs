import {build} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import config from '../../vite.config.js';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw Error('Controlled CSS fault requires the isolated remote runner');
const directory=path.resolve('.backend-ci/fault-results/css-gate');mkdirSync(directory,{recursive:true});
writeFileSync(path.join(directory,'entry.js'),"import './fault.css';\n");
writeFileSync(path.join(directory,'fault.css'),'body { color: red; /* unclosed comment');
let error;
try{await build({...config,configFile:false,build:{...config.build,outDir:path.join(directory,'output'),rollupOptions:{input:path.join(directory,'entry.js')}}});}catch(failure){error=failure;}
const diagnostic=String(error?.stack||error||'');
const passed=Boolean(error)&&/CssSyntaxError|postcss|Unclosed comment/i.test(diagnostic);
writeFileSync(path.join(directory,'result.json'),JSON.stringify({passed,capturedAt:new Date().toISOString(),diagnostic},null,2));
if(!passed)throw Error('The real Vite/PostCSS build did not reject malformed CSS');
console.log('PASS: real Vite/PostCSS compilation rejects the controlled malformed CSS');
