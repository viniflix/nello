import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const archiveName = /^supabase-[0-9T_-]+-[a-f0-9-]{36}\.zip$/;
const sourceName = name => typeof name === 'string' && name.startsWith('supabase/')
  && !name.split('/').some(part => !part || part === '.' || part === '..' || (part.startsWith('.') && part !== '.gitignore'))
  && !/[\\\x00-\x1f]/.test(name);

function rejectLinks(target) {
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Backup paths must not contain symbolic links');
    if (path.dirname(current) === current) break;
  }
}

export function assertPrivateDestination(destination, repository) {
  if (!path.isAbsolute(destination) || within(path.resolve(repository), path.resolve(destination))
    || path.resolve(destination).split(path.sep).some(part => /^onedrive(?:$| - )/i.test(part))) {
    throw Error('Backup destination must be absolute, outside the checkout and OneDrive');
  }
  rejectLinks(destination);
  return path.resolve(destination);
}

export async function verifyInfrastructureBackup(repository, destination) {
  const root = assertPrivateDestination(destination, repository);
  const receiptFile = path.join(root, 'latest-manifest.json');
  rejectLinks(receiptFile);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  if (receipt.schemaVersion !== 2 || receipt.scope !== 'tracked_supabase_infrastructure_only'
    || !archiveName.test(receipt.archive || '') || !/^[a-f0-9]{64}$/.test(receipt.archiveSha256 || '')) {
    throw Error('Invalid infrastructure backup receipt');
  }
  const archive = path.join(root, receipt.archive); rejectLinks(archive);
  const bytes = fs.readFileSync(archive);
  if (digest(bytes) !== receipt.archiveSha256) throw Error('Backup archive integrity mismatch');
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.values(zip.files).filter(file => !file.dir);
  if (entries.some(file => file.unsafeOriginalName && file.unsafeOriginalName !== file.name)) throw Error('Unsafe archive path');
  const manifest = JSON.parse(await zip.file('manifest.json')?.async('string') || 'null');
  if (manifest?.scope !== receipt.scope || manifest.schemaVersion !== 2 || !Array.isArray(manifest.files)
    || manifest.files.length !== receipt.fileCount || entries.length !== receipt.fileCount + 1) throw Error('Incomplete archive manifest');
  const seen = new Set();
  for (const item of manifest.files) {
    if (!sourceName(item.path) || seen.has(item.path) || !Number.isSafeInteger(item.bytes) || item.bytes < 0
      || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !zip.file(item.path)) throw Error('Invalid archive source identity');
    seen.add(item.path);
    const recovered = await zip.file(item.path).async('nodebuffer');
    if (recovered.length !== item.bytes || digest(recovered) !== item.sha256) throw Error('Recovered infrastructure bytes differ');
  }
  return { scope: receipt.scope, fileCount: receipt.fileCount, archive, archiveSha256: receipt.archiveSha256, verified: true, productionData: false };
}

export async function createInfrastructureBackup(repository, destination) {
  const root = assertPrivateDestination(destination, repository);
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const tracked = git(['ls-files', '-z', '--', 'supabase']).split('\0').filter(Boolean);
  if (!tracked.length || tracked.some(name => !sourceName(name))) throw Error('Valid tracked Supabase sources required');
  const zip = new JSZip(); const files = [];
  for (const name of tracked) {
    const source = path.join(repository, ...name.split('/')); rejectLinks(source);
    if (!fs.statSync(source).isFile()) throw Error('Tracked infrastructure source is not a regular file');
    const bytes = fs.readFileSync(source);
    files.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
    zip.file(name, bytes, { createFolders: false });
  }
  const capturedAt = new Date().toISOString();
  const manifest = { schemaVersion: 2, scope: 'tracked_supabase_infrastructure_only', capturedAt,
    sourceSha: git(['rev-parse', 'HEAD']).trim(), workingTreeModified: !!git(['status', '--porcelain', '--', 'supabase']).trim(), files };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.mkdirSync(root, { recursive: true, mode: 0o700 }); rejectLinks(root);
  const archive = `supabase-${capturedAt.replace(/[:.Z]/g, '_')}-${randomUUID()}.zip`;
  fs.writeFileSync(path.join(root, archive), bytes, { mode: 0o600, flag: 'wx' });
  const receipt = { schemaVersion: 2, scope: manifest.scope, capturedAt, archive, archiveSha256: digest(bytes), fileCount: files.length };
  const receiptFile = path.join(root, 'latest-manifest.json'); rejectLinks(receiptFile);
  // Retain previous archives and receipts, including those from the old helper.
  if (fs.existsSync(receiptFile)) fs.copyFileSync(receiptFile, path.join(root, `receipt-${randomUUID()}.json`), fs.constants.COPYFILE_EXCL);
  const temporary = path.join(root, `receipt-${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, receiptFile);
  return verifyInfrastructureBackup(repository, root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const verifyOnly = args.includes('--verify-only');
  const index = args.indexOf('--backup-root');
  if (args.some((arg, i) => arg !== '--verify-only' && arg !== '--backup-root' && !(index >= 0 && i === index + 1)) || (index >= 0 && !args[index + 1])) throw Error('Usage: infrastructure-backup.mjs [--verify-only] [--backup-root absolute-private-directory]');
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const destination = index >= 0 ? args[index + 1] : path.join(os.homedir(), '.codex', 'private-backups', 'supabase-infrastructure');
  const result = await (verifyOnly ? verifyInfrastructureBackup : createInfrastructureBackup)(repository, destination);
  console.log(JSON.stringify(result));
  console.log('Infrastructure only: no database rows, Auth accounts, Storage object bytes or hosted configuration backed up.');
}
