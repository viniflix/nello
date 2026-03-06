/**
 * Importa reference_foods do hipozero para hipozero.old
 *
 * Uso: node scripts/import-reference-foods.js
 *
 * Variáveis de ambiente (ou .env):
 * - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY = destino (hipozero.old)
 * - HIPOZERO_SOURCE_URL, HIPOZERO_SOURCE_KEY = origem (hipozero)
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Carregar .env manualmente se existir
try {
  const envPath = resolve(process.cwd(), '.env');
  const env = readFileSync(envPath, 'utf8');
  env.split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
} catch (_) {}

const BATCH_SIZE = 500;

const sourceUrl = process.env.HIPOZERO_SOURCE_URL || 'https://avdulurxladkqtqszgno.supabase.co';
// service_role bypassa RLS - use se reference_foods retornar 0 com anon
const sourceKey = process.env.HIPOZERO_SOURCE_SERVICE_KEY || process.env.HIPOZERO_SOURCE_KEY;
const destUrl = process.env.HIPOZERO_DEST_URL || process.env.VITE_SUPABASE_URL || 'https://afyoidxrshkmplxhcyeh.supabase.co';
const destKey = process.env.HIPOZERO_DEST_SERVICE_KEY || process.env.HIPOZERO_DEST_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!sourceKey) {
  console.error('Defina HIPOZERO_SOURCE_KEY ou HIPOZERO_SOURCE_SERVICE_KEY (origem).');
  process.exit(1);
}
if (!destKey) {
  console.error('Defina HIPOZERO_DEST_SERVICE_KEY ou HIPOZERO_DEST_KEY (hipozero.old - destino)');
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
  'nutritionist_id', 'description', 'preparation', 'is_active', 'created_at'
];

function bigintToUuid(bigintId) {
  const hex = createHash('sha256').update(`food-${bigintId}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function mapFoodToReference(row) {
  const id = typeof row.id === 'string' ? row.id : bigintToUuid(Number(row.id));
  return {
    id,
    name: row.name ?? '',
    source: row.source ?? 'tbca',
    source_id: String(row.source_id ?? row.id ?? ''),
    group: row.group ?? null,
    group_norm: row.group_norm ?? row.group ?? null,
    description: row.description ?? null,
    preparation: row.preparation ?? null,
    portion_size: row.portion_size ?? 100,
    base_unit: row.base_unit ?? 'g',
    calories: row.calories ?? 0,
    protein: row.protein ?? 0,
    carbs: row.carbs ?? 0,
    fat: row.fat ?? 0,
    fiber: row.fiber ?? 0,
    sodium: row.sodium ?? null,
    saturated_fat: row.saturated_fat ?? 0,
    monounsaturated_fat: row.monounsaturated_fat ?? 0,
    polyunsaturated_fat: row.polyunsaturated_fat ?? 0,
    trans_fat: row.trans_fat ?? 0,
    cholesterol: row.cholesterol ?? 0,
    sugar: row.sugar ?? 0,
    calcium: row.calcium ?? null,
    iron: row.iron ?? null,
    magnesium: row.magnesium ?? 0,
    phosphorus: row.phosphorus ?? 0,
    potassium: row.potassium ?? null,
    zinc: row.zinc ?? 0,
    vitamin_a: row.vitamin_a ?? 0,
    vitamin_c: row.vitamin_c ?? null,
    vitamin_d: row.vitamin_d ?? 0,
    vitamin_e: row.vitamin_e ?? 0,
    vitamin_b12: row.vitamin_b12 ?? 0,
    folate: row.folate ?? 0,
    nutritionist_id: row.nutritionist_id ?? null,
    is_active: row.is_active ?? true,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

async function run() {
  let offset = 0;
  let total = 0;
  let sourceTable = 'reference_foods';
  let useFoodsFallback = false;

  console.log('Importando reference_foods de', sourceUrl, 'para', destUrl);

  // Primeiro batch: detectar se reference_foods está vazia e tentar foods
  let { data, error } = await source.from('reference_foods').select('*').range(0, 0);

  if (error) {
    console.error('Erro ao acessar reference_foods:', error);
    process.exit(1);
  }
  if (!data?.length) {
    const { data: foodsData } = await source.from('foods').select('*').range(0, 1);
    if (foodsData?.length) {
      sourceTable = 'foods';
      useFoodsFallback = true;
      console.log('reference_foods vazia - usando tabela foods (schema antigo)');
    }
  }

  while (true) {
    const res = await source
      .from(sourceTable)
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1)
      .order(useFoodsFallback ? 'id' : 'created_at');

    if (res.error) {
      console.error('Erro ao buscar:', res.error);
      process.exit(1);
    }
    data = res.data;
    if (!data?.length) break;

    const rows = data.map((r) => (useFoodsFallback ? mapFoodToReference(r) : {
      id: r.id,
      name: r.name,
      source: r.source,
      source_id: r.source_id,
      group: r.group,
      group_norm: r.group_norm,
      description: r.description,
      preparation: r.preparation,
      portion_size: r.portion_size ?? 100,
      base_unit: r.base_unit ?? 'g',
      calories: r.calories ?? 0,
      protein: r.protein ?? 0,
      carbs: r.carbs ?? 0,
      fat: r.fat ?? 0,
      fiber: r.fiber ?? 0,
      sodium: r.sodium,
      saturated_fat: r.saturated_fat ?? 0,
      monounsaturated_fat: r.monounsaturated_fat ?? 0,
      polyunsaturated_fat: r.polyunsaturated_fat ?? 0,
      trans_fat: r.trans_fat ?? 0,
      cholesterol: r.cholesterol ?? 0,
      sugar: r.sugar ?? 0,
      calcium: r.calcium,
      iron: r.iron,
      magnesium: r.magnesium ?? 0,
      phosphorus: r.phosphorus ?? 0,
      potassium: r.potassium,
      zinc: r.zinc ?? 0,
      vitamin_a: r.vitamin_a ?? 0,
      vitamin_c: r.vitamin_c,
      vitamin_d: r.vitamin_d ?? 0,
      vitamin_e: r.vitamin_e ?? 0,
      vitamin_b12: r.vitamin_b12 ?? 0,
      folate: r.folate ?? 0,
      nutritionist_id: r.nutritionist_id,
      is_active: r.is_active ?? true,
      created_at: r.created_at,
    }));

    const { error: insertError } = await dest.from('reference_foods').upsert(rows, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

    if (insertError) {
      console.error('Erro ao inserir batch:', insertError);
      process.exit(1);
    }

    total += rows.length;
    console.log(`  Inseridos ${total} alimentos...`);
    offset += BATCH_SIZE;

    if (data.length < BATCH_SIZE) break;
  }

  console.log('Importação concluída. Total:', total);
  if (total === 0) {
    console.log('\nDica: Se RLS bloquear o acesso, use HIPOZERO_SOURCE_SERVICE_KEY (service_role do hipozero).');
  }
}

run();
