import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Generated evidence is private/CI-only; no environment, credentials or user data.
const out = '.qa-licenses';
mkdirSync(out, { recursive: true });
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm run check:licenses');
const sbom = execFileSync(process.execPath, [npmCli, 'sbom', '--package-lock-only', '--omit=dev', '--sbom-format=cyclonedx'], {encoding:'utf8',maxBuffer:16*1024*1024});
writeFileSync(join(out, 'runtime.cyclonedx.json'), sbom);
const inventory = [], notices = [], missing = [];
for (const [path, item] of Object.entries(lock.packages)) {
  if (!path || item.dev) continue;
  const installed = existsSync(join(path, 'package.json'));
  const pkg = installed ? JSON.parse(readFileSync(join(path, 'package.json'),'utf8')) : {};
  const name = pkg.name || path.split('node_modules/').at(-1);
  const declared = pkg.license || pkg.licenses?.map(value=>value.type).join(' OR ') || item.license;
  const license = typeof declared === 'string' ? declared : declared?.type;
  if (!license) missing.push(`${name}@${item.version}`);
  inventory.push({name,version:item.version,license:license||'UNKNOWN',installedOnThisPlatform:installed,integrity:item.integrity||null});
  if (installed) {
    const files = readdirSync(path).filter(file=>/^(license|licence|copying|notice)(?:\.|$)/i.test(file));
    const texts = files.filter(file=>!file.endsWith('.json')).map(file=>readFileSync(join(path,file),'utf8'));
    notices.push(`${name}@${item.version}\nDeclared license: ${license}\n${texts.join('\n')||'License text not packaged; declaration retained.'}`);
  }
}
inventory.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
writeFileSync(join(out,'runtime-inventory.json'),JSON.stringify({scope:'production dependency tree, including build peers; not an assertion that every package is shipped in the browser',inventory},null,2));
writeFileSync(join(out,'THIRD_PARTY_NOTICES.txt'),notices.join('\n\n========================================\n\n'));
if (missing.length) throw new Error(`Missing third-party license declarations: ${missing.join(', ')}`);
console.log(`SBOM and notices generated for ${inventory.length} locked production dependency entries.`);
