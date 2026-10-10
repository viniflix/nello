import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { assertPrivateDestination, createInfrastructureBackup, verifyInfrastructureBackup } from './infrastructure-backup.mjs';

let root, repository, destination;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => { const file = path.join(repository, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const receipt = () => JSON.parse(fs.readFileSync(path.join(destination, 'latest-manifest.json'), 'utf8'));
beforeEach(() => {
  root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nello-infrastructure-test-'));
  repository = path.join(root, 'repository'); destination = path.join(root, 'private');
  fs.mkdirSync(repository);
  const git = args => execFileSync('git', args, { cwd: repository, stdio: 'pipe' });
  git(['init', '-b', 'main']);
  write('supabase/config.toml', 'project_id="synthetic"\n');
  write('supabase/migrations/20261010000000_synthetic.sql', 'select 1;\n');
  git(['add', 'supabase']);
  git(['-c', 'user.name=Vinicius Costa', '-c', 'user.email=viniciusvyctor@gmail.com', 'commit', '-m', 'Synthetic infrastructure fixture']);
});
afterEach(() => {
  const resolved = fs.realpathSync(root);
  if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('nello-infrastructure-test-')) throw Error('Unsafe test cleanup target');
  fs.rmSync(resolved, { recursive: true, force: true });
});

describe('Private tracked infrastructure backup and actual recovered bytes', () => {
  it('recovers tracked sources and omits private ignored files and CLI state', async () => {
    write('supabase/private.env', 'synthetic-ignored-marker');
    write('supabase/.temp/private.txt', 'synthetic-cli-marker');
    const result = await createInfrastructureBackup(repository, destination);
    const zip = await JSZip.loadAsync(fs.readFileSync(result.archive));
    expect(result.fileCount).toBe(2);
    expect(result.productionData).toBe(false);
    expect(zip.file('supabase/private.env')).toBeNull();
    expect(zip.file('supabase/.temp/private.txt')).toBeNull();
    const restored = path.join(root, 'recovered');
    for (const name of ['supabase/config.toml', 'supabase/migrations/20261010000000_synthetic.sql']) {
      const bytes = await zip.file(name).async('nodebuffer');
      fs.mkdirSync(path.dirname(path.join(restored, name)), { recursive: true });
      fs.writeFileSync(path.join(restored, name), bytes);
      expect(fs.readFileSync(path.join(restored, name))).toEqual(fs.readFileSync(path.join(repository, name)));
    }
    expect((await verifyInfrastructureBackup(repository, destination)).verified).toBe(true);
  });
  it('preserves old archives and verifies past backups independently of changed current sources', async () => {
    const first = await createInfrastructureBackup(repository, destination);
    write('supabase/config.toml', 'project_id="synthetic-updated"\n');
    expect((await verifyInfrastructureBackup(repository, destination)).verified).toBe(true);
    const next = await createInfrastructureBackup(repository, destination);
    expect(next.archive).not.toBe(first.archive);
    expect(hash(fs.readFileSync(first.archive))).toBe(first.archiveSha256);
    expect(fs.readdirSync(destination).filter(name => name.startsWith('receipt-')).length).toBe(1);
  });
  it('rejects damaged archive bytes instead of verifying only the current checkout', async () => {
    const backup = await createInfrastructureBackup(repository, destination);
    const bytes = fs.readFileSync(backup.archive); bytes[0] ^= 1; fs.writeFileSync(backup.archive, bytes);
    await expect(verifyInfrastructureBackup(repository, destination)).rejects.toThrow('archive integrity');
  });
  it('rejects receipt traversal without reading a file outside the backup root', async () => {
    await createInfrastructureBackup(repository, destination);
    fs.writeFileSync(path.join(destination, 'latest-manifest.json'), JSON.stringify({ ...receipt(), archive: '../external.zip' }));
    await expect(verifyInfrastructureBackup(repository, destination)).rejects.toThrow('receipt');
  });
  it('rejects content tampering even when the outer archive checksum is recomputed', async () => {
    const backup = await createInfrastructureBackup(repository, destination);
    const zip = await JSZip.loadAsync(fs.readFileSync(backup.archive));
    zip.file('supabase/config.toml', 'altered');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' }); fs.writeFileSync(backup.archive, bytes);
    fs.writeFileSync(path.join(destination, 'latest-manifest.json'), JSON.stringify({ ...receipt(), archiveSha256: hash(bytes) }));
    await expect(verifyInfrastructureBackup(repository, destination)).rejects.toThrow('Recovered infrastructure bytes');
  });
  it('rejects a missing archived source even if the receipt checksum is recomputed', async () => {
    const backup = await createInfrastructureBackup(repository, destination);
    const zip = await JSZip.loadAsync(fs.readFileSync(backup.archive)); zip.remove('supabase/config.toml');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' }); fs.writeFileSync(backup.archive, bytes);
    fs.writeFileSync(path.join(destination, 'latest-manifest.json'), JSON.stringify({ ...receipt(), archiveSha256: hash(bytes) }));
    await expect(verifyInfrastructureBackup(repository, destination)).rejects.toThrow('Incomplete archive');
  });
  it('rejects checkout, OneDrive and relative destinations before writing', () => {
    for (const target of [path.join(repository, 'backups'), path.join(root, 'OneDrive', 'backups'), path.join(root, 'OneDrive - Company', 'backups'), 'relative']) {
      expect(() => assertPrivateDestination(target, repository)).toThrow('outside');
      expect(fs.existsSync(target)).toBe(false);
    }
  });
  it('rejects a linked backup destination', () => {
    fs.mkdirSync(destination); const link = path.join(root, 'linked');
    fs.symlinkSync(destination, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => assertPrivateDestination(link, repository)).toThrow('symbolic');
  });
});
