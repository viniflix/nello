/**
 * Exporta reference_foods do hipozero para um arquivo SQL.
 * Execute o .sql gerado no Supabase SQL Editor do hipozero.old.
 *
 * Uso: HIPOZERO_SOURCE_SERVICE_KEY=xxx node scripts/export-reference-foods-to-sql.js
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const sourceUrl = 'https://avdulurxladkqtqszgno.supabase.co';
const sourceKey = process.env.HIPOZERO_SOURCE_SERVICE_KEY;

if (!sourceKey) {
  console.error('Defina HIPOZERO_SOURCE_SERVICE_KEY');
  process.exit(1);
}

const source = createClient(sourceUrl, sourceKey);
const BATCH = 500; // limite do Supabase por request

function esc(v) {
  if (v == null) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function run() {
  let offset = 0;
  const all = [];
  console.log('Buscando reference_foods...');
  while (true) {
    const { data, error } = await source
      .from('reference_foods')
      .select('*')
      .range(offset, offset + BATCH - 1)
      .order('created_at');
    if (error) {
      console.error(error);
      process.exit(1);
    }
    if (!data?.length) break;
    all.push(...data);
    console.log(`  ${all.length}...`);
    offset += BATCH;
    if (data.length < BATCH) break;
  }
  console.log('Total:', all.length);

  const cols = ['id','name','source','source_id','group','group_norm','description','preparation','portion_size','base_unit','calories','protein','carbs','fat','fiber','sodium','saturated_fat','monounsaturated_fat','polyunsaturated_fat','trans_fat','cholesterol','sugar','calcium','iron','magnesium','phosphorus','potassium','zinc','vitamin_a','vitamin_c','vitamin_d','vitamin_e','vitamin_b12','folate','nutritionist_id','is_active','created_at'];
  const colsQuoted = cols.map(c => c === 'group' ? '"group"' : c);

  const CHUNK = 2000; // registros por arquivo (SQL Editor tem limite de tamanho)
  const dir = resolve(process.cwd(), 'supabase/sql/migration-foods');
  let written = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const lines = [
      `-- Parte ${Math.floor(i / CHUNK) + 1}/${Math.ceil(all.length / CHUNK)} (${chunk.length} registros)`,
      '-- Execute no SQL Editor: https://supabase.com/dashboard/project/afyoidxrshkmplxhcyeh/sql/new',
      i === 0 ? 'BEGIN;\nDELETE FROM public.reference_foods;' : '',
      '',
    ].filter(Boolean);
    for (const r of chunk) {
      const vals = cols.map(c => esc(r[c]));
      lines.push(`INSERT INTO public.reference_foods (${colsQuoted.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, source=EXCLUDED.source, source_id=EXCLUDED.source_id, "group"=EXCLUDED."group", group_norm=EXCLUDED.group_norm, description=EXCLUDED.description, preparation=EXCLUDED.preparation, portion_size=EXCLUDED.portion_size, base_unit=EXCLUDED.base_unit, calories=EXCLUDED.calories, protein=EXCLUDED.protein, carbs=EXCLUDED.carbs, fat=EXCLUDED.fat, fiber=EXCLUDED.fiber, sodium=EXCLUDED.sodium, saturated_fat=EXCLUDED.saturated_fat, monounsaturated_fat=EXCLUDED.monounsaturated_fat, polyunsaturated_fat=EXCLUDED.polyunsaturated_fat, trans_fat=EXCLUDED.trans_fat, cholesterol=EXCLUDED.cholesterol, sugar=EXCLUDED.sugar, calcium=EXCLUDED.calcium, iron=EXCLUDED.iron, magnesium=EXCLUDED.magnesium, phosphorus=EXCLUDED.phosphorus, potassium=EXCLUDED.potassium, zinc=EXCLUDED.zinc, vitamin_a=EXCLUDED.vitamin_a, vitamin_c=EXCLUDED.vitamin_c, vitamin_d=EXCLUDED.vitamin_d, vitamin_e=EXCLUDED.vitamin_e, vitamin_b12=EXCLUDED.vitamin_b12, folate=EXCLUDED.folate, nutritionist_id=EXCLUDED.nutritionist_id, is_active=EXCLUDED.is_active, created_at=EXCLUDED.created_at;`);
    }
    lines.push(i + CHUNK >= all.length ? 'COMMIT;' : '');
    const fname = `import-reference-foods-part${String(Math.floor(i / CHUNK) + 1).padStart(2, '0')}.sql`;
    writeFileSync(resolve(dir, fname), lines.join('\n'), 'utf8');
    written++;
    console.log('  Gerado:', fname);
  }
  console.log('Total:', written, 'arquivos em', dir);
}

run();
