import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltam variáveis de ambiente.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const genericMeasures = [
  { name: 'Colher de Sopa', code: 'col. sopa', order_index: 10, is_active: true },
  { name: 'Colher de Chá', code: 'col. chá', order_index: 20, is_active: true },
  { name: 'Xícara de Chá', code: 'xíc. chá', order_index: 30, is_active: true },
  { name: 'Copo', code: 'copo', order_index: 40, is_active: true },
  { name: 'Escumadeira', code: 'escum.', order_index: 50, is_active: true },
  { name: 'Concha', code: 'concha', order_index: 60, is_active: true },
  { name: 'Unidade', code: 'un.', order_index: 70, is_active: true },
  { name: 'Fatia', code: 'fatia', order_index: 80, is_active: true },
  { name: 'Unidade Média', code: 'un. méd.', order_index: 90, is_active: true }
];

const topFoodsMapping = [
  { term: 'arroz', type: 'cozido', mappings: [
      { measure: 'Colher de Sopa', grams: 25, quantity: 1 },
      { measure: 'Escumadeira', grams: 70, quantity: 1 }
    ]
  },
  { term: 'feijão', type: 'cozido', mappings: [
      { measure: 'Colher de Sopa', grams: 17, quantity: 1 },
      { measure: 'Concha', grams: 86, quantity: 1 }
    ]
  },
  { term: 'ovo', type: 'inteiro', mappings: [
      { measure: 'Unidade Média', grams: 50, quantity: 1 }
    ]
  },
  { term: 'frango', type: 'peito', mappings: [
      { measure: 'Unidade Média', grams: 100, quantity: 1 },
      { measure: 'Colher de Sopa', grams: 20, quantity: 1 }
    ]
  },
  { term: 'banana', type: 'prata', mappings: [
      { measure: 'Unidade Média', grams: 70, quantity: 1 }
    ]
  },
  { term: 'leite', type: 'integral', mappings: [
      { measure: 'Copo', grams: 200, quantity: 1 },
      { measure: 'Xícara de Chá', grams: 240, quantity: 1 }
    ]
  },
  { term: 'pão', type: 'francês', mappings: [
      { measure: 'Unidade Média', grams: 50, quantity: 1 }
    ]
  },
  { term: 'óleo', type: 'soja', mappings: [
      { measure: 'Colher de Sopa', grams: 8, quantity: 1 },
      { measure: 'Colher de Chá', grams: 2, quantity: 1 }
    ]
  },
  { term: 'aveia', type: 'flocos', mappings: [
      { measure: 'Colher de Sopa', grams: 15, quantity: 1 }
    ]
  }
];

async function seed() {
  console.log('--- Iniciando Seed da Wave 1 de Medidas Caseiras ---');

  console.log('Inserindo medidas genéricas no catálogo...');
  for (const m of genericMeasures) {
    let { error } = await supabase
      .from('household_measures')
      .upsert({ ...m }, { onConflict: 'name' });
      
    if (error) {
      if(!error.message.includes('duplicate') && !error.message.includes('unique')) {
         console.error(`Erro ao inserir ${m.name}:`, error.message);
      }
    }
  }

  const { data: measures, error: errM } = await supabase.from('household_measures').select('id, name');
  if(errM || !measures) {
    console.error('Erro ao ler medidas caseiras genéricas:', errM);
    return;
  }
  const measureMap = measures.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.id }), {});

  console.log('Buscando alimentos para realizar o cruzamento...');
  // Tenta name primeiro, se não description
  let { data: foods, error: foodsError } = await supabase.from('foods').select('id, description');
  if(foodsError && foodsError.code === '42703') {
     const res = await supabase.from('foods').select('id, name');
     foods = res.data;
     foodsError = res.error;
     if(foods) {
       foods = foods.map(f => ({ id: f.id, description: f.name }));
     }
  }
  
  if (foodsError || !foods || foods.length === 0) {
    console.error('Não foi possível obter a tabela foods, pulando os cruzamentos.', foodsError?.message);
    return;
  }

  let inseridos = 0;

  for (const mapping of topFoodsMapping) {
    const matches = foods.filter(f => 
      f.description && f.description.toLowerCase().includes(mapping.term) && 
      (!mapping.type || f.description.toLowerCase().includes(mapping.type))
    ).slice(0, 5);

    for (const food of matches) {
      for (const m of mapping.mappings) {
        const measureId = measureMap[m.measure];
        if (!measureId) continue;

        let { error: relError } = await supabase
          .from('food_household_measures')
          .insert({
            food_id: food.id,
            measure_id: measureId,
            grams: m.grams,
            quantity: m.quantity
          });

        if (relError && !relError.message?.includes('duplicate') && !relError.message?.includes('unique')) {
          console.log(`Erro associar ${m.measure} ao ${food.description}:`, relError.message);
        } else if (!relError) {
          inseridos++;
        }
      }
    }
  }

  console.log(`--- Seed Concluído! ${inseridos} novas medidas alimentares iteradas com sucesso. ---`);
}

seed();
