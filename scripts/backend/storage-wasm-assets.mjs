import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function prepareStorageWasmAssets() {
  const manifest = JSON.parse(readFileSync('operations/backend/wave07-wasm-assets.json', 'utf8'));
  const target = path.resolve('supabase/functions/upload-private-file/.generated');
  mkdirSync(target, { recursive: true });
  for (const asset of manifest.assets) {
    if (!/^[A-Za-z0-9_.-]+$/.test(asset.name) || !asset.source.startsWith('node_modules/')) throw Error('Invalid WASM asset manifest');
    const bytes = readFileSync(asset.source);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('Pinned Storage WASM asset drift');
    copyFileSync(asset.source, path.join(target, asset.name));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareStorageWasmAssets();
