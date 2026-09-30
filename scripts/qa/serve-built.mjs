import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from './isolated-runtime.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
assertIsolatedRuntime();
const root=path.resolve('dist');
createServer((req,res)=>{
  const requestPath=new URL(req.url,'http://localhost').pathname;
  const servingRoot=requestPath.startsWith('/__qa__/')?path.resolve('.backend-ci/qa-assets'):root;
  const relative=requestPath.startsWith('/__qa__/')?requestPath.slice('/__qa__'.length):requestPath;
  const file=path.resolve(servingRoot,'.'+decodeURIComponent(relative));
  if (!file.startsWith(servingRoot+path.sep)) {res.writeHead(400).end();return;}
  if(path.extname(file)&&!existsSync(file)){res.writeHead(404).end();return;}
  const target=existsSync(file)&&path.extname(file)?file:path.join(root,'index.html');
  const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(target)]||'application/octet-stream';
  try {res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(readFileSync(target));} catch {res.writeHead(404).end();}
}).listen(4173,'127.0.0.1');
