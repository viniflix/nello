/**
 * Tenta reimportar os 641 alimentos que falharam.
 * Insere um por vez para capturar erros.
 *
 * Uso: HIPOZERO_SOURCE_SERVICE_KEY=xxx HIPOZERO_DEST_SERVICE_KEY=xxx node scripts/reimport-missing-foods.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envPath = resolve(process.cwd(), '.env');
  const env = readFileSync(envPath, 'utf8');
  env.split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
} catch (_) {}

const sourceUrl = process.env.HIPOZERO_SOURCE_URL || 'https://avdulurxladkqtqszgno.supabase.co';
const sourceKey = process.env.HIPOZERO_SOURCE_SERVICE_KEY || process.env.HIPOZERO_SOURCE_KEY;
const destUrl = process.env.HIPOZERO_DEST_URL || 'https://afyoidxrshkmplxhcyeh.supabase.co';
const destKey = process.env.HIPOZERO_DEST_SERVICE_KEY || process.env.HIPOZERO_DEST_KEY;

if (!sourceKey || !destKey) {
  console.error('Defina HIPOZERO_SOURCE_SERVICE_KEY e HIPOZERO_DEST_SERVICE_KEY');
  process.exit(1);
}

const source = createClient(sourceUrl, sourceKey);
const dest = createClient(destUrl, destKey);

const COLS = [
  'id', 'name', 'source', 'source_id', 'group', 'group_norm', 'description', 'preparation',
  'portion_size', 'base_unit', 'calories', 'protein', 'carbs', 'fat', 'fiber',
  'sodium', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat', 'trans_fat',
  'cholesterol', 'sugar', 'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium',
  'zinc', 'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_b12', 'folate',
  'nutritionist_id', 'is_active', 'created_at',
];

async function fetchAll(client, selectCols) {
  const all = [];
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    const { data } = await client.from('reference_foods').select(selectCols).range(offset, offset + BATCH - 1).order('id');
    if (!data?.length) break;
    all.push(...data);
    offset += BATCH;
    if (data.length < BATCH) break;
  }
  return all;
}

async function main() {
  console.log('Carregando IDs do destino...');
  const destRows = await fetchAll(dest, 'id');
  const destIds = new Set(destRows.map((r) => r.id));
  console.log('  Destino:', destIds.size);

  console.log('Carregando origem...');
  const sourceRows = await fetchAll(source, COLS.join(','));
  const missing = sourceRows.filter((r) => !destIds.has(r.id));
  console.log('Tentando reimportar', missing.length, 'alimentos...');

  let ok = 0, fail = 0;
  const errors = [];
  for (let i = 0; i < missing.length; i++) {
    const row = missing[i];
    const r = {};
    for (const c of COLS) {
      r[c] = row[c] ?? (['portion_size','calories','protein','carbs','fat','fiber','saturated_fat','monounsaturated_fat','polyunsaturated_fat','trans_fat','cholesterol','sugar','magnesium','phosphorus','zinc','vitamin_a','vitamin_d','vitamin_e','vitamin_b12','folate'].includes(c) ? 0 : null);
      if (r[c] === null && c === 'is_active') r[c] = true;
    }
    const { error } = await dest.from('reference_foods').upsert([r], { onConflict: 'id' });
    if (error) {
      fail++;
      errors.push({ id: row.id, name: row.name, source: row.source, source_id: row.source_id, err: error.message });
      if (errors.length <= 10) console.log('ERRO:', row.id, row.source, row.source_id, error.message);
    } else {
      ok++;
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${missing.length} ok=${ok} fail=${fail}`);
  }
  console.log('Resultado:', ok, 'ok,', fail, 'falhas');
  if (errors.length) {
    console.log('Primeiros erros:', JSON.stringify(errors.slice(0, 5), null, 2));
  }
}

main().catch(console.error);
