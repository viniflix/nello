/**
 * Script para automatizar a importação de Medidas Caseiras de bases open-source (ex: brolesi/taco)
 * e gerar lotes (Waves) de migrations SQL para o HipoZero (Nello).
 * 
 * Uso:
 * 1. Baixe o JSON de medidas caseiras da base (ex: taco_measures.json)
 * 2. Rode este script passando o arquivo JSON como argumento.
 * 3. O script cruzará os nomes com a base remota do Nello e gerará um arquivo SQL de lote.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: Faltam variáveis de ambiente do Supabase (.env.local).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BATCH_SIZE = 100;

async function generateWaveMigration(jsonFilePath) {
    if (!fs.existsSync(jsonFilePath)) {
        console.error(`ERRO: Arquivo JSON não encontrado: ${jsonFilePath}`);
        console.log('Baixe o JSON do repositório brolesi/taco ou equivalente antes de rodar.');
        process.exit(1);
    }

    console.log(`Lendo arquivo fonte de medidas: ${jsonFilePath}...`);
    const measuresData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    
    // Obter apenas uma lista de nomes únicos para buscar no Supabase
    const foodNamesToSearch = [...new Set(measuresData.map(item => item.food_name || item.description))];
    console.log(`Identificados ${foodNamesToSearch.length} alimentos únicos no JSON fonte.`);

    console.log('Buscando alimentos correspondentes no banco remoto do Nello (food_bank)...');
    
    let matchedFoods = [];
    
    // Processamento em lotes para não sobrecarregar a API
    for (let i = 0; i < foodNamesToSearch.length; i += 50) {
        const batch = foodNamesToSearch.slice(i, i + 50);
        
        // Simples aproximação: usamos IN ou ilike para encontrar os IDs remotos
        // Para um script em produção ideal, usaríamos FTS (Full Text Search) ou pg_trgm.
        const { data, error } = await supabase
            .from('food_bank')
            .select('id, description')
            .in('description', batch);

        if (error) {
            console.error('Erro ao consultar Supabase no lote', i, error);
            continue;
        }

        if (data && data.length > 0) {
            matchedFoods.push(...data);
        }
        process.stdout.write(`Progresso: ${Math.min(i + 50, foodNamesToSearch.length)} / ${foodNamesToSearch.length}\r`);
    }

    console.log(`\nMatch concluído! Encontrados ${matchedFoods.length} alimentos exatos no banco do Nello.`);

    if (matchedFoods.length === 0) {
        console.log('Nenhum alimento do JSON bateu exatamente com a nomenclatura do banco remoto.');
        console.log('Sugestão: melhore o algoritmo de matching (ex: remover acentos, ignorar case, FTS).');
        return;
    }

    // Gerar arquivos de migration em Waves de 100 alimentos
    let waveIndex = 2; // Wave 1 já foi feita manualmente
    let currentDate = new Date();
    
    for (let i = 0; i < matchedFoods.length; i += BATCH_SIZE) {
        const batchFoods = matchedFoods.slice(i, i + BATCH_SIZE);
        
        // Formatar o timestamp para YYYYMMDDHHMMSS
        const timestamp = currentDate.toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const migrationFileName = `${timestamp}_d11_wave${waveIndex}_household_measures.sql`;
        const migrationPath = path.resolve(__dirname, `../supabase/migrations/${migrationFileName}`);
        
        let sqlContent = `-- D11: Household Measures Seed - Wave ${waveIndex}\n`;
        sqlContent += `-- Gerado automaticamente pelo import_measures.js\n\n`;
        sqlContent += `DO $$\nDECLARE\n    v_food_id uuid;\nBEGIN\n\n`;

        batchFoods.forEach(food => {
            // Acha as medidas desse alimento no JSON original
            const foodMeasures = measuresData.filter(m => (m.food_name || m.description) === food.description);
            
            if (foodMeasures.length > 0) {
                sqlContent += `    -- Alimento: ${food.description.replace(/'/g, "''")}\n`;
                sqlContent += `    v_food_id := '${food.id}';\n`;
                
                foodMeasures.forEach(measure => {
                    const measureLabel = (measure.measure_type || measure.medida_caseira).replace(/'/g, "''");
                    const weight = measure.weight_in_grams || measure.peso_gramas;
                    
                    sqlContent += `    INSERT INTO public.food_measures (reference_food_id, measure_id, weight_in_grams, label)
    SELECT v_food_id, id, ${weight}, '${measureLabel}'
    FROM public.household_measures WHERE label ILIKE '%${measureLabel.split(' ')[0]}%' LIMIT 1
    ON CONFLICT DO NOTHING;\n`;
                });
                sqlContent += `\n`;
            }
        });

        sqlContent += `END $$;\n`;
        
        fs.writeFileSync(migrationPath, sqlContent);
        console.log(`Gerada Migration Wave ${waveIndex}: ${migrationPath}`);
        
        waveIndex++;
        currentDate.setSeconds(currentDate.getSeconds() + 1); // incrementa timestamp para as próximas
    }

    console.log('Geração de Waves concluída! Revise os arquivos SQL e suba via Supabase CLI.');
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Uso: node import_measures.js <caminho_para_taco_medidas.json>');
} else {
    generateWaveMigration(args[0]);
}
