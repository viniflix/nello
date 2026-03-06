/**
 * Análise comparativa: hipozero (origem) vs hipozero.old (destino)
 * - Lista alimentos NÃO importados e possíveis motivos
 * - Verifica integridade dos dados dos alimentos importados
 *
 * Uso: HIPOZERO_SOURCE_SERVICE_KEY=xxx HIPOZERO_DEST_SERVICE_KEY=xxx node scripts/analyze-reference-foods-import.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
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

const BATCH = 1000;
const COLS = [
  'id', 'name', 'source', 'source_id', 'group', 'group_norm', 'description', 'preparation',
  'portion_size', 'base_unit', 'calories', 'protein', 'carbs', 'fat', 'fiber',
  'sodium', 'saturated_fat', 'monounsaturated_fat', 'polyunsaturated_fat', 'trans_fat',
  'cholesterol', 'sugar', 'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium',
  'zinc', 'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_b12', 'folate',
  'nutritionist_id', 'is_active', 'created_at',
];

function val(v) {
  if (v == null) return null;
  if (typeof v === 'number' && isNaN(v)) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function eq(a, b) {
  const va = val(a);
  const vb = val(b);
  if (va === vb) return true;
  if (va == null && vb == null) return true;
  if (va == null || vb == null) return false;
  if (typeof va === 'number' && typeof vb === 'number') return Math.abs(va - vb) < 1e-9;
  return String(va) === String(vb);
}

async function fetchAll(client, table) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(COLS.join(','))
      .range(offset, offset + BATCH - 1)
      .order('id');
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    offset += BATCH;
    if (data.length < BATCH) break;
  }
  return all;
}

function analyzeMissing(sourceRows, destIds, destBySourceId) {
  const missing = [];
  const destIdSet = new Set(destIds);
  const keyToFirstId = new Map(); // (source, source_id) -> id que foi importado (o primeiro do lote)

  for (const r of sourceRows) {
    const id = r.id;
    const key = `${r.source}:${r.source_id}`;
    const destHasThisKey = destBySourceId.has(key);

    if (!destIdSet.has(id)) {
      let reason;
      if (destHasThisKey) {
        const winner = destBySourceId.get(key);
        const winnerId = winner?.id ?? '?';
        reason = `Duplicado (source, source_id): constraint UNIQUE no destino – já existe registro com id ${winnerId}`;
      } else {
        reason = 'Não importado (motivo indeterminado - possível falha na inserção)';
      }
      missing.push({
        id,
        name: r.name,
        source: r.source,
        source_id: r.source_id,
        reason,
        duplicate_of: destHasThisKey ? destBySourceId.get(key).id : null,
      });
    }
    if (!keyToFirstId.has(key)) keyToFirstId.set(key, id);
  }
  return missing;
}

const NUMERIC_COLS = new Set(['portion_size','base_unit','calories','protein','carbs','fat','fiber','sodium','saturated_fat','monounsaturated_fat','polyunsaturated_fat','trans_fat','cholesterol','sugar','calcium','iron','magnesium','phosphorus','potassium','zinc','vitamin_a','vitamin_c','vitamin_d','vitamin_e','vitamin_b12','folate']);

function analyzeIntegrity(sourceRows, destRows) {
  const destById = new Map(destRows.map((r) => [r.id, r]));
  const onlyNullToZero = [];
  const realDiffs = [];
  let ok = 0;

  for (const src of sourceRows) {
    const d = destById.get(src.id);
    if (!d) continue;

    const diffs = [];
    const nullToZero = [];
    for (const c of COLS) {
      if (c === 'id') continue;
      if (!eq(src[c], d[c])) {
        const isNullToZero = NUMERIC_COLS.has(c) && (src[c] == null || src[c] === '') && (d[c] === 0 || d[c] === '0');
        if (isNullToZero) nullToZero.push({ col: c });
        else diffs.push({ col: c, src: src[c], dest: d[c] });
      }
    }
    if (diffs.length || nullToZero.length) {
      const entry = { id: src.id, name: src.name, diffs, nullToZero };
      if (diffs.length === 0) {
        onlyNullToZero.push(entry);
      } else {
        realDiffs.push(entry);
      }
    } else {
      ok++;
    }
  }
  return { ok, onlyNullToZero, realDiffs };
}

async function main() {
  console.log('Carregando reference_foods da origem (hipozero)...');
  const sourceRows = await fetchAll(source, 'reference_foods');
  console.log('  Origem:', sourceRows.length);

  console.log('Carregando reference_foods do destino (hipozero.old)...');
  const destRows = await fetchAll(dest, 'reference_foods');
  console.log('  Destino:', destRows.length);

  const destIds = destRows.map((r) => r.id);
  const destBySourceId = new Map();
  for (const r of destRows) {
    destBySourceId.set(`${r.source}:${r.source_id}`, r);
  }

  // 1. Alimentos não importados
  const missing = analyzeMissing(sourceRows, destIds, destBySourceId);
  console.log('\n--- ALIMENTOS NÃO IMPORTADOS ---');
  console.log('Total:', missing.length);

  // Agrupar por motivo
  const byReason = new Map();
  for (const m of missing) {
    const r = m.reason;
    if (!byReason.has(r)) byReason.set(r, []);
    byReason.get(r).push(m);
  }
  for (const [reason, items] of byReason) {
    console.log(`\nMotivo: ${reason}`);
    console.log(`  Quantidade: ${items.length}`);
    items.slice(0, 5).forEach((m) => console.log(`  - ${m.id} | ${m.source}:${m.source_id} | ${m.name?.slice(0, 50)}...`));
    if (items.length > 5) console.log(`  ... e mais ${items.length - 5}`);
  }

  if (missing.length > 0 && missing.length <= 50) {
    console.log('\nLista completa de IDs não importados:');
    missing.forEach((m) => console.log(`  ${m.id} | ${m.source}:${m.source_id} | ${m.name}`));
  }

  // 2. Integridade dos dados importados
  const { ok, onlyNullToZero, realDiffs } = analyzeIntegrity(sourceRows, destRows);
  console.log('\n--- INTEGRIDADE DOS DADOS IMPORTADOS ---');
  console.log('Importados com dados idênticos:', ok);
  console.log('Apenas null→0 (esperado pelo script):', onlyNullToZero.length);
  console.log('Com divergências reais:', realDiffs.length);

  if (realDiffs.length > 0) {
    console.log('\nPrimeiros 15 com divergências reais:');
    realDiffs.slice(0, 15).forEach((d) => {
      console.log(`  ${d.id} | ${d.name?.slice(0, 40)}`);
      d.diffs.forEach((dd) => console.log(`    ${dd.col}: origem=${dd.src} dest=${dd.dest}`));
    });
    if (realDiffs.length > 15) console.log(`  ... e mais ${realDiffs.length - 15}`);
  }

  // 3. Duplicados (source, source_id) na origem
  const srcByKey = new Map();
  const dupInSource = [];
  for (const r of sourceRows) {
    const key = `${r.source}:${r.source_id}`;
    if (srcByKey.has(key)) dupInSource.push({ key, ids: [srcByKey.get(key), r.id] });
    else srcByKey.set(key, r.id);
  }
  if (dupInSource.length) {
    console.log('\n--- DUPLICADOS NA ORIGEM (source+source_id) ---');
    console.log('Chaves duplicadas na origem:', dupInSource.length);
    dupInSource.slice(0, 5).forEach((d) => console.log(`  ${d.key} -> ids: ${d.ids.join(', ')}`));
  }

  // 4. Agrupar ausentes por motivo
  const missingByReason = new Map();
  for (const m of missing) {
    const r = m.reason;
    if (!missingByReason.has(r)) missingByReason.set(r, []);
    missingByReason.get(r).push(m);
  }

  // Resumo final
  console.log('\n--- RESUMO ---');
  console.log('Origem:', sourceRows.length);
  console.log('Destino:', destRows.length);
  console.log('Não importados:', missing.length);
  console.log('Importados corretos (idênticos):', ok);
  console.log('Importados (apenas null→0):', onlyNullToZero.length);
  console.log('Importados com divergência real:', realDiffs.length);

  // Exportar lista completa de não importados
  const reportPath = resolve(process.cwd(), 'supabase/sql/migration-foods/ANALISE_IMPORTACAO_REFERENCE_FOODS.md');
  const lines = [
    '# Análise da importação reference_foods (hipozero → hipozero.old)',
    '',
    '**Data:** ' + new Date().toISOString().slice(0, 10),
    '',
    '## Resumo',
    '',
    '| Métrica | Valor |',
    '|---------|-------|',
    `| Origem (hipozero) | ${sourceRows.length} |`,
    `| Destino (hipozero.old) | ${destRows.length} |`,
    `| Não importados | ${missing.length} |`,
    `| Importados idênticos | ${ok} |`,
    `| Importados (apenas null→0) | ${onlyNullToZero.length} |`,
    `| Importados com divergência real | ${realDiffs.length} |`,
    '',
    '## Motivos dos não importados',
    '',
  ];
  for (const [reason, items] of missingByReason) {
    lines.push(`### ${reason}`);
    lines.push(`Quantidade: ${items.length}`);
    lines.push('');
    lines.push('| ID | source | source_id | Nome |');
    lines.push('|----|--------|-----------|------|');
    for (const m of items) {
      lines.push(`| ${m.id} | ${m.source} | ${m.source_id} | ${(m.name || '').replace(/\|/g, ' ').slice(0, 60)} |`);
    }
    lines.push('');
  }
  lines.push('## Alimentos não importados (lista completa)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(missing, null, 2));
  lines.push('```');
  writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log('\nRelatório salvo em:', reportPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
