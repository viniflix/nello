/**
 * Verifica schema do hipozero.old via Supabase JS client (service_role)
 *
 * Uso: HIPOZERO_OLD_SERVICE_KEY=<key> node scripts/verify-hipozero-old-schema.js
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

const url = 'https://afyoidxrshkmplxhcyeh.supabase.co';
const serviceKey = process.env.HIPOZERO_OLD_SERVICE_KEY || process.env.HIPOZERO_DEST_SERVICE_KEY;

if (!serviceKey) {
  console.error('Defina HIPOZERO_OLD_SERVICE_KEY ou HIPOZERO_DEST_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const results = {};

async function run() {
  console.log('Verificando hipozero.old...\n');

  // 1. reference_foods
  try {
    const { count, error } = await supabase.from('reference_foods').select('*', { count: 'exact', head: true });
    if (error) throw error;
    results.reference_foods = { exists: true, count: count ?? '?' };
    console.log('1. reference_foods: OK, count =', count ?? '?');
  } catch (e) {
    results.reference_foods = { exists: false, error: e.message };
    console.log('1. reference_foods: ERRO -', e.message);
  }

  // 2. nutritionist_foods
  try {
    const { count, error } = await supabase.from('nutritionist_foods').select('*', { count: 'exact', head: true });
    if (error) throw error;
    results.nutritionist_foods = { exists: true, count: count ?? '?' };
    console.log('2. nutritionist_foods: OK, count =', count ?? '?');
  } catch (e) {
    results.nutritionist_foods = { exists: false, error: e.message };
    console.log('2. nutritionist_foods: ERRO -', e.message);
  }

  // 3. view foods (SELECT * FROM foods LIMIT 1 via RPC ou raw SQL)
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT * FROM foods LIMIT 1' }).single();
    if (error) {
      // Fallback: usar .from('foods') que pode funcionar se foods for view/tabela
      const r = await supabase.from('foods').select('*').limit(1);
      if (r.error) throw r.error;
      results.foods_view = { exists: true, sample: r.data?.length ? '1 row' : '0 rows' };
      console.log('3. foods (view): OK via .from("foods")');
    } else {
      results.foods_view = { exists: true, sample: data };
      console.log('3. foods (view): OK via RPC');
    }
  } catch (e) {
    try {
      const r = await supabase.from('foods').select('*').limit(1);
      if (r.error) throw r.error;
      results.foods_view = { exists: true, sample: r.data?.length ? '1 row' : '0 rows' };
      console.log('3. foods (view): OK via .from("foods")');
    } catch (e2) {
      results.foods_view = { exists: false, error: e2.message };
      console.log('3. foods (view): ERRO -', e2.message);
    }
  }

  // 4. Estrutura (colunas) das tabelas
  const tables = ['meal_plan_foods', 'meal_items', 'food_measures', 'food_household_measures'];
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(0);
      if (error) throw error;
      // Com limit(0) não retorna rows, mas a resposta inclui colunas no schema. Pegar uma linha real.
      const { data: one } = await supabase.from(table).select('*').limit(1).single();
      const cols = one ? Object.keys(one) : [];
      if (cols.length === 0) {
        const { data: anyRow } = await supabase.from(table).select('*').limit(1);
        if (anyRow?.[0]) results[table] = { columns: Object.keys(anyRow[0]) };
        else results[table] = { columns: '(tabela vazia - schema não disponível via client)' };
      } else {
        results[table] = { columns: cols };
      }
      console.log(`4. ${table}: colunas =`, results[table].columns?.length ?? 0);
    } catch (e) {
      results[table] = { error: e.message };
      console.log(`4. ${table}: ERRO -`, e.message);
    }
  }

  // Output markdown
  console.log('\n\n--- RESUMO (Markdown) ---\n');
  console.log(markdownReport(results));
}

function markdownReport(r) {
  let md = `# Verificação hipozero.old (afyoidxrshkmplxhcyeh)\n\n`;

  md += `## 1. reference_foods\n`;
  if (r.reference_foods?.exists) {
    md += `- Existe: **Sim**\n- Linhas: **${r.reference_foods.count}**\n`;
  } else {
    md += `- Existe: **Não**\n`;
    if (r.reference_foods?.error) md += `- Erro: \`${r.reference_foods.error}\`\n`;
  }

  md += `\n## 2. nutritionist_foods\n`;
  if (r.nutritionist_foods?.exists) {
    md += `- Existe: **Sim**\n- Linhas: **${r.nutritionist_foods.count}**\n`;
  } else {
    md += `- Existe: **Não**\n`;
    if (r.nutritionist_foods?.error) md += `- Erro: \`${r.nutritionist_foods.error}\`\n`;
  }

  md += `\n## 3. View foods\n`;
  if (r.foods_view?.exists) {
    md += `- Existe: **Sim**\n`;
  } else {
    md += `- Existe: **Não**\n`;
    if (r.foods_view?.error) md += `- Erro: \`${r.foods_view.error}\`\n`;
  }

  md += `\n## 4. Estrutura das tabelas\n\n`;
  for (const t of ['meal_plan_foods', 'meal_items', 'food_measures', 'food_household_measures']) {
    md += `### ${t}\n`;
    if (r[t]?.columns) {
      md += `- Colunas: \`${r[t].columns.join('`, `')}\`\n`;
    } else if (r[t]?.error) {
      md += `- Erro: \`${r[t].error}\`\n`;
    }
    md += '\n';
  }

  return md;
}

run();
