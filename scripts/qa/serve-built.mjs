import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from './isolated-runtime.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import healthHandler from '../../api/health.js';
import cspReportHandler from '../../api/csp-report.js';
import { matchesApplicationPath } from '../availability/routes.mjs';
assertIsolatedRuntime();
config({path:'.env.production.local',quiet:true});
const root=path.resolve('dist');
const routing=JSON.parse(readFileSync('vercel.json','utf8'));
createServer(async(req,res)=>{
  const requestPath=new URL(req.url,'http://localhost').pathname;
  for(const header of routing.headers.find(entry=>entry.source==='/(.*)').headers){
    const value=header.key==='Content-Security-Policy'?header.value.replace("connect-src 'self'", "connect-src 'self' http://localhost:54321 http://127.0.0.1:54321 ws://localhost:54321 ws://127.0.0.1:54321 http://localhost:55321 http://127.0.0.1:55321 ws://localhost:55321 ws://127.0.0.1:55321"):
      header.key==='Reporting-Endpoints'?header.value.replace('https://nellonutri.com.br','http://localhost:4173'):header.value;
    res.setHeader(header.key,value);
  }
  if(requestPath==='/api/health'){
    res.status=code=>{res.statusCode=code;return res;};
    return healthHandler(req,res);
  }
  if(requestPath==='/api/csp-report'){
    res.status=code=>{res.statusCode=code;return res;};
    return cspReportHandler(req,res);
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
  const servingRoot=requestPath.startsWith('/__qa__/')?path.resolve('.backend-ci/qa-assets'):root;
  const relative=requestPath.startsWith('/__qa__/')?requestPath.slice('/__qa__'.length):requestPath;
  let file;
  try{file=path.resolve(servingRoot,'.'+decodeURIComponent(relative));}catch{res.writeHead(400).end();return;}
  if (file!==servingRoot&&!file.startsWith(servingRoot+path.sep)) {res.writeHead(400).end();return;}
  if(path.extname(file)&&!existsSync(file)){res.writeHead(404).end();return;}
  if(!existsSync(file)&&!matchesApplicationPath(requestPath,routing.rewrites)){
    if(req.headers.accept?.includes('text/html')) res.writeHead(404,{'content-type':'text/html'}).end(readFileSync(path.join(root,'404.html')));
    else res.writeHead(404).end();
    return;
  }
  const rewritten=routing.rewrites.find(({source})=>source===requestPath||source+'/'===requestPath)?.destination;
  const target=existsSync(file)&&path.extname(file)?file:rewritten?path.resolve(root,'.'+rewritten):path.join(root,'index.html');
  const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.txt':'text/plain','.xml':'application/xml','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(target)]||'application/octet-stream';
  try {res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(readFileSync(target));} catch {res.writeHead(404).end();}
}).listen(4173,'127.0.0.1');
