import { supabase } from '@/lib/customSupabaseClient';
import { subDays, format } from 'date-fns';

/**
 * Demo Data Service (Enterprise Version)
 * 
 * Funções avançadas para gerar dados de demonstração no Supabase
 * com histórico temporal e perfis realistas para demos de investidores
 */

/**
 * Gera um UUID v4 aleatório
 * @returns {string} UUID
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para navegadores antigos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gera um número inteiro aleatório entre min e max (inclusive)
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Busca um alimento no banco de dados
 * @param {string} term - Termo de busca
 * @returns {Promise<object|null>} Primeiro alimento encontrado ou null
 */
async function searchFood(term) {
  try {
    const { data, error } = await supabase
      .from('foods')
      .select('id, name, calories, protein, carbs, fat, portion_size')
      .ilike('name', `%${term}%`)
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('[demoDataService] Erro ao buscar alimento:', error);
    return null;
  }
}

// Nomes brasileiros aleatórios para pacientes fantasma
const RANDOM_NAMES = [
  'Ana Silva', 'Carlos Souza', 'Maria Santos', 'João Oliveira', 'Fernanda Costa',
  'Pedro Almeida', 'Juliana Lima', 'Rafael Pereira', 'Camila Rodrigues', 'Lucas Ferreira',
  'Beatriz Gomes', 'Gabriel Martins', 'Isabela Ribeiro', 'Thiago Carvalho', 'Larissa Araújo'
];

// Gêneros aleatórios
const GENDERS = ['M', 'F', 'O'];

/**
 * Cria um paciente fantasma (ghost patient) vinculado ao nutricionista
 * @param {string} nutritionistId - UUID do nutricionista admin
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function createGhostPatient(nutritionistId) {
  try {
    // Gerar UUID aleatório para o paciente
    const patientId = generateUUID();
    
    // Selecionar nome e dados aleatórios
    const randomName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    const randomGender = GENDERS[Math.floor(Math.random() * GENDERS.length)];
    
    // Gerar email fake único com padrão de segurança (@demo.hipozero)
    const emailSuffix = patientId.slice(0, 8); // Primeiros 8 caracteres do UUID
    const fakeEmail = `demo.${emailSuffix}@demo.hipozero`;
    
    // Gerar data de nascimento aleatória (entre 18 e 65 anos)
    const today = new Date();
    const age = 18 + Math.floor(Math.random() * 47); // 18-65 anos
    const birthDate = new Date(today.getFullYear() - age, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    
    // Dados do perfil do paciente
    const profileData = {
      id: patientId,
      name: randomName,
      email: fakeEmail,
      user_type: 'patient',
      nutritionist_id: nutritionistId,
      gender: randomGender,
      birth_date: birthDate.toISOString().split('T')[0], // Formato YYYY-MM-DD
      height: 150 + Math.floor(Math.random() * 50), // 150-200 cm
      weight: 50 + Math.floor(Math.random() * 50), // 50-100 kg
      goal: ['Perder peso', 'Ganhar massa', 'Manter peso', 'Melhorar saúde'][Math.floor(Math.random() * 4)],
      is_active: true,
      // Flag de segurança: Marcar como demo no preferences JSONB
      preferences: { is_demo: true },
      // Campos opcionais para evitar erros de constraint
      cpf: null, // Não preencher CPF para evitar conflitos
      phone: null,
      occupation: null,
      civil_status: null,
      observations: null,
      address: null,
    };

    // Inserir no user_profiles
    const { data, error } = await supabase
      .from('user_profiles')
      .insert(profileData)
      .select()
      .single();

    if (error) {
      console.error('[demoDataService] Erro ao criar paciente fantasma:', error);
      return { data: null, error };
    }

    console.log('[demoDataService] Paciente fantasma criado:', data);
    return { data, error: null };
  } catch (error) {
    console.error('[demoDataService] Erro inesperado ao criar paciente fantasma:', error);
    return { data: null, error };
  }
}

/**
 * Preenche o diário do paciente com refeições aleatórias para hoje
 * @param {string} patientId - UUID do paciente
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function fillDailyDiary(patientId) {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Buscar 4-5 alimentos aleatórios do banco
    const { data: foods, error: foodsError } = await supabase
      .from('foods')
      .select('id, name, calories, protein, carbs, fat, portion_size')
      .limit(50); // Pegar um pool maior para ter mais variedade

    if (foodsError) {
      console.error('[demoDataService] Erro ao buscar alimentos:', foodsError);
      return { data: null, error: foodsError };
    }

    if (!foods || foods.length === 0) {
      return { 
        data: null, 
        error: { message: 'Nenhum alimento encontrado no banco de dados' } 
      };
    }

    // Selecionar 4-5 alimentos aleatórios
    const selectedFoods = [];
    const numFoods = 4 + Math.floor(Math.random() * 2); // 4 ou 5 alimentos
    const shuffled = [...foods].sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < numFoods && i < shuffled.length; i++) {
      selectedFoods.push(shuffled[i]);
    }

    // Tipos de refeição e horários
    const mealTypes = [
      { type: 'breakfast', time: '08:00:00', name: 'Café da Manhã' },
      { type: 'lunch', time: '12:30:00', name: 'Almoço' },
      { type: 'snack', time: '16:00:00', name: 'Lanche' },
      { type: 'dinner', time: '19:30:00', name: 'Jantar' }
    ];

    // Criar refeições para cada tipo
    const mealsCreated = [];
    const mealItemsCreated = [];

    for (const mealType of mealTypes) {
      // Selecionar 1-2 alimentos aleatórios para esta refeição
      const numItemsForMeal = 1 + Math.floor(Math.random() * 2); // 1 ou 2 alimentos
      const shuffledForMeal = [...selectedFoods].sort(() => 0.5 - Math.random());
      const foodsForMeal = shuffledForMeal.slice(0, numItemsForMeal);

      if (foodsForMeal.length === 0) continue;

      // Calcular totais nutricionais
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;

      const itemsForMeal = [];

      for (const food of foodsForMeal) {
        // Quantidade aleatória (entre 50g e 200g, ou 1-3 unidades se for medida caseira)
        const quantity = 50 + Math.floor(Math.random() * 150);
        
        // Calcular valores nutricionais baseado na quantidade
        const multiplier = quantity / (food.portion_size || 100); // portion_size geralmente é 100g
        
        const itemCalories = (food.calories || 0) * multiplier;
        const itemProtein = (food.protein || 0) * multiplier;
        const itemCarbs = (food.carbs || 0) * multiplier;
        const itemFat = (food.fat || 0) * multiplier;

        totalCalories += itemCalories;
        totalProtein += itemProtein;
        totalCarbs += itemCarbs;
        totalFat += itemFat;

        itemsForMeal.push({
          food_id: food.id,
          name: food.name,
          quantity: quantity,
          unit: 'gram',
          calories: Math.round(itemCalories * 100) / 100,
          protein: Math.round(itemProtein * 100) / 100,
          carbs: Math.round(itemCarbs * 100) / 100,
          fat: Math.round(itemFat * 100) / 100,
        });
      }

      // Criar a refeição
      const { data: meal, error: mealError } = await supabase
        .from('meals')
        .insert({
          patient_id: patientId,
          meal_date: todayStr,
          meal_time: mealType.time,
          meal_type: mealType.type,
          notes: `Refeição de demonstração - ${mealType.name}`,
          total_calories: Math.round(totalCalories * 100) / 100,
          total_protein: Math.round(totalProtein * 100) / 100,
          total_carbs: Math.round(totalCarbs * 100) / 100,
          total_fat: Math.round(totalFat * 100) / 100,
        })
        .select()
        .single();

      if (mealError) {
        console.error(`[demoDataService] Erro ao criar refeição ${mealType.type}:`, mealError);
        continue; // Continuar com as outras refeições mesmo se uma falhar
      }

      mealsCreated.push(meal);

      // Adicionar itens da refeição
      const itemsToInsert = itemsForMeal.map(item => ({
        meal_id: meal.id,
        food_id: item.food_id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      }));

      const { error: itemsError } = await supabase
        .from('meal_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error(`[demoDataService] Erro ao inserir itens da refeição ${mealType.type}:`, itemsError);
      } else {
        mealItemsCreated.push(...itemsToInsert);
      }
    }

    if (mealsCreated.length === 0) {
      return {
        data: null,
        error: { message: 'Não foi possível criar nenhuma refeição' }
      };
    }

    console.log('[demoDataService] Diário preenchido:', {
      meals: mealsCreated.length,
      items: mealItemsCreated.length
    });

    return {
      data: {
        meals: mealsCreated,
        items: mealItemsCreated,
        totalMeals: mealsCreated.length,
        totalItems: mealItemsCreated.length
      },
      error: null
    };
  } catch (error) {
    console.error('[demoDataService] Erro inesperado ao preencher diário:', error);
    return { data: null, error };
  }
}

/**
 * Preenche o histórico de refeições dos últimos N dias
 * Cria um "dia saudável padrão" com variação realista para gráficos
 * @param {string} userId - UUID do paciente
 * @param {number} daysBack - Número de dias para preencher (padrão: 7)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function fillMealHistory(userId, daysBack = 7) {
  try {
    // Buscar alimentos padrão para um dia saudável
    const coffee = await searchFood('café');
    const chicken = await searchFood('frango');
    const rice = await searchFood('arroz');
    const eggs = await searchFood('ovo');
    const banana = await searchFood('banana');
    const bread = await searchFood('pão');

    // Pool de alimentos (usar os encontrados ou buscar alternativas)
    const standardFoods = [coffee, chicken, rice, eggs, banana, bread].filter(Boolean);

    if (standardFoods.length === 0) {
      // Fallback: buscar qualquer alimento do banco
      const { data: fallbackFoods } = await supabase
        .from('foods')
        .select('id, name, calories, protein, carbs, fat, portion_size')
        .limit(10);

      if (!fallbackFoods || fallbackFoods.length === 0) {
        return {
          data: null,
          error: { message: 'Nenhum alimento encontrado no banco de dados' }
        };
      }

      standardFoods.push(...fallbackFoods);
    }

    const mealsCreated = [];
    const mealItemsCreated = [];

    // Loop pelos últimos N dias
    for (let i = 0; i < daysBack; i++) {
      const targetDate = subDays(new Date(), i);
      const dateStr = format(targetDate, 'yyyy-MM-dd');

      // Definir refeições padrão com variação
      const mealPlan = [
        {
          type: 'breakfast',
          time: '08:00:00',
          foods: [
            { food: coffee || standardFoods[0], quantity: 200 + getRandomInt(-20, 20) }, // 180-220ml
            { food: bread || standardFoods[1] || standardFoods[0], quantity: 50 + getRandomInt(-10, 10) }, // 40-60g
            { food: eggs || standardFoods[2] || standardFoods[0], quantity: 100 + getRandomInt(-20, 20) } // 80-120g
          ]
        },
        {
          type: 'lunch',
          time: '12:30:00',
          foods: [
            { food: chicken || standardFoods[0], quantity: 150 + getRandomInt(-30, 30) }, // 120-180g
            { food: rice || standardFoods[1] || standardFoods[0], quantity: 200 + getRandomInt(-40, 40) } // 160-240g
          ]
        },
        {
          type: 'snack',
          time: '16:00:00',
          foods: [
            { food: banana || standardFoods[2] || standardFoods[0], quantity: 100 + getRandomInt(-20, 20) } // 80-120g
          ]
        },
        {
          type: 'dinner',
          time: '19:30:00',
          foods: [
            { food: chicken || standardFoods[0], quantity: 120 + getRandomInt(-25, 25) }, // 95-145g
            { food: rice || standardFoods[1] || standardFoods[0], quantity: 150 + getRandomInt(-30, 30) } // 120-180g
          ]
        }
      ];

      // Criar refeições para este dia
      for (const mealPlanItem of mealPlan) {
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;

        const itemsForMeal = [];

        for (const foodItem of mealPlanItem.foods) {
          if (!foodItem.food) continue;

          const food = foodItem.food;
          const quantity = Math.max(10, foodItem.quantity); // Mínimo 10g
          const multiplier = quantity / (food.portion_size || 100);

          // Aplicar variação de ±10% para realismo
          const variation = 0.9 + (Math.random() * 0.2); // 0.9 a 1.1
          const itemCalories = (food.calories || 0) * multiplier * variation;
          const itemProtein = (food.protein || 0) * multiplier * variation;
          const itemCarbs = (food.carbs || 0) * multiplier * variation;
          const itemFat = (food.fat || 0) * multiplier * variation;

          totalCalories += itemCalories;
          totalProtein += itemProtein;
          totalCarbs += itemCarbs;
          totalFat += itemFat;

          itemsForMeal.push({
            food_id: food.id,
            name: food.name,
            quantity: Math.round(quantity),
            unit: 'gram',
            calories: Math.round(itemCalories * 100) / 100,
            protein: Math.round(itemProtein * 100) / 100,
            carbs: Math.round(itemCarbs * 100) / 100,
            fat: Math.round(itemFat * 100) / 100,
          });
        }

        if (itemsForMeal.length === 0) continue;

        // Criar a refeição
        const { data: meal, error: mealError } = await supabase
          .from('meals')
          .insert({
            patient_id: userId,
            meal_date: dateStr,
            meal_time: mealPlanItem.time,
            meal_type: mealPlanItem.type,
            notes: `Refeição gerada automaticamente - ${dateStr}`,
            total_calories: Math.round(totalCalories * 100) / 100,
            total_protein: Math.round(totalProtein * 100) / 100,
            total_carbs: Math.round(totalCarbs * 100) / 100,
            total_fat: Math.round(totalFat * 100) / 100,
          })
          .select()
          .single();

        if (mealError) {
          console.error(`[demoDataService] Erro ao criar refeição ${mealPlanItem.type} para ${dateStr}:`, mealError);
          continue;
        }

        mealsCreated.push(meal);

        // Inserir itens
        const itemsToInsert = itemsForMeal.map(item => ({
          meal_id: meal.id,
          food_id: item.food_id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        }));

        const { error: itemsError } = await supabase
          .from('meal_items')
          .insert(itemsToInsert);

        if (itemsError) {
          console.error(`[demoDataService] Erro ao inserir itens para ${dateStr}:`, itemsError);
        } else {
          mealItemsCreated.push(...itemsToInsert);
        }
      }
    }

    console.log('[demoDataService] Histórico preenchido:', {
      days: daysBack,
      meals: mealsCreated.length,
      items: mealItemsCreated.length
    });

    return {
      data: {
        daysBack,
        meals: mealsCreated,
        items: mealItemsCreated,
        totalMeals: mealsCreated.length,
        totalItems: mealItemsCreated.length
      },
      error: null
    };
  } catch (error) {
    console.error('[demoDataService] Erro inesperado ao preencher histórico:', error);
    return { data: null, error };
  }
}

/**
 * Cria um "squad" de 3 pacientes com perfis diferentes e históricos
 * @param {string} nutritionistId - UUID do nutricionista admin
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function createGhostSquad(nutritionistId) {
  try {
    const patientsCreated = [];
    const patientsFailed = [];
    
    // Definir configuração do squad
    const squadConfig = [
      {
        name: 'Roberto Silva',
        gender: 'M',
        birthDate: new Date(1990, 5, 15),
        height: 175,
        weight: 70,
        goal: 'Ganhar massa',
        isActive: true,
        weightHistory: [
          { date: subDays(new Date(), 60), weight: 70.0 },
          { date: subDays(new Date(), 40), weight: 71.0 },
          { date: subDays(new Date(), 20), weight: 72.0 },
          { date: subDays(new Date(), 5), weight: 73.5 },
        ],
        chatMessage: null,
      },
      {
        name: 'Julia Costa',
        gender: 'F',
        birthDate: new Date(1988, 3, 22),
        height: 165,
        weight: 70,
        goal: 'Perder peso',
        isActive: true,
        weightHistory: [
          { date: subDays(new Date(), 60), weight: 70.0 },
          { date: subDays(new Date(), 40), weight: 68.0 },
          { date: subDays(new Date(), 20), weight: 66.0 },
          { date: subDays(new Date(), 5), weight: 64.0 },
        ],
        chatMessage: {
          message: 'Bom dia nutri! Estou adorando os resultados. Já perdi 6kg! 🎉',
          created_at: subDays(new Date(), 1).toISOString(),
        },
      },
      {
        name: 'Marcos Santos',
        gender: 'M',
        birthDate: new Date(1992, 8, 10),
        height: 180,
        weight: 80,
        goal: 'Manter peso', // Goal seguro
        isActive: true, // FIX: Mudado para true (pode ser desativado depois se necessário)
        weightHistory: [],
        chatMessage: null,
      },
    ];

    // Processar cada paciente individualmente com isolamento de erros
    for (const config of squadConfig) {
      try {
        const patientId = generateUUID();
        const emailSuffix = patientId.slice(0, 8);
        const email = `demo.${emailSuffix}@demo.hipozero`;

        // Criar perfil do paciente
        const { data: patient, error: patientError } = await supabase
          .from('user_profiles')
          .insert({
            id: patientId,
            name: config.name,
            email: email,
            user_type: 'patient',
            nutritionist_id: nutritionistId,
            gender: config.gender,
            birth_date: format(config.birthDate, 'yyyy-MM-dd'),
            height: config.height,
            weight: config.weight,
            goal: config.goal,
            is_active: config.isActive,
            preferences: { is_demo: true },
            cpf: null,
            phone: null,
            occupation: null,
            civil_status: null,
            observations: null,
            address: null,
          })
          .select()
          .single();

        if (patientError) {
          console.error(`[demoDataService] Erro ao criar ${config.name}:`, patientError);
          patientsFailed.push({ name: config.name, error: patientError.message });
          continue; // Continuar para o próximo paciente
        }

        patientsCreated.push(patient);

        // Adicionar histórico de peso (se houver)
        if (config.weightHistory && config.weightHistory.length > 0) {
          for (const record of config.weightHistory) {
            try {
              await supabase.from('growth_records').insert({
                patient_id: patientId,
                record_date: format(record.date, 'yyyy-MM-dd'),
                weight: record.weight,
              });
            } catch (weightError) {
              console.error(`[demoDataService] Erro ao adicionar peso para ${config.name}:`, weightError);
              // Não falha o processo, apenas loga o erro
            }
          }
        }

        // Adicionar mensagem de chat (se houver)
        if (config.chatMessage) {
          try {
            await supabase.from('chats').insert({
              from_id: patientId,
              to_id: nutritionistId,
              message: config.chatMessage.message,
              message_type: 'text',
              created_at: config.chatMessage.created_at,
            });
          } catch (chatError) {
            console.error(`[demoDataService] Erro ao adicionar chat para ${config.name}:`, chatError);
            // Não falha o processo, apenas loga o erro
          }
        }

        console.log(`[demoDataService] ✅ ${config.name} criado com sucesso`);
      } catch (error) {
        console.error(`[demoDataService] ❌ Erro inesperado ao criar ${config.name}:`, error);
        patientsFailed.push({ name: config.name, error: error.message || 'Erro desconhecido' });
        // Continuar para o próximo paciente mesmo se houver erro
      }
    }

    // Retornar resultado com estatísticas
    const result = {
      created: patientsCreated.length,
      failed: patientsFailed.length,
      patients: patientsCreated,
      failures: patientsFailed,
    };

    if (patientsCreated.length === 0) {
      return {
        data: null,
        error: { 
          message: 'Não foi possível criar nenhum paciente',
          details: patientsFailed
        }
      };
    }

    console.log('[demoDataService] Squad processado:', {
      created: result.created,
      failed: result.failed,
      names: patientsCreated.map(p => p.name),
      failures: patientsFailed.map(f => f.name)
    });

    return {
      data: result,
      error: result.failed > 0 ? { 
        message: `${result.created} pacientes criados, ${result.failed} falharam`,
        details: patientsFailed
      } : null
    };
  } catch (error) {
    console.error('[demoDataService] Erro crítico ao criar squad:', error);
    return { data: null, error };
  }
}

/**
 * Limpa todos os dados de demonstração gerados
 * @param {string} nutritionistId - UUID do nutricionista admin
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function cleanupDemoData(nutritionistId) {
  try {
    let deletedCount = 0;
    const errors = [];

    // SAFETY: Buscar pacientes fantasmas APENAS por email pattern (@demo.hipozero)
    // Isso garante que mesmo se um paciente real tiver o mesmo nome, ele NÃO será deletado
    const { data: ghostPatients, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, name, email')
      .eq('nutritionist_id', nutritionistId)
      .ilike('email', '%@demo.hipozero'); // SAFETY FILTER: Apenas emails de demo

    if (fetchError) {
      console.error('[demoDataService] Erro ao buscar pacientes fantasmas:', fetchError);
      return { data: null, error: fetchError };
    }

    if (!ghostPatients || ghostPatients.length === 0) {
      console.log('[demoDataService] Nenhum paciente fantasma encontrado para limpeza (email pattern: @demo.hipozero)');
      return {
        data: { deletedPatients: 0, deletedMeals: 0, deletedRecords: 0 },
        error: null
      };
    }

    console.log('[demoDataService] Pacientes de demo encontrados para limpeza:', ghostPatients.map(p => ({ name: p.name, email: p.email })));

    const ghostPatientIds = ghostPatients.map(p => p.id);

    // 2. Deletar registros de peso (growth_records)
    const { error: recordsError } = await supabase
      .from('growth_records')
      .delete()
      .in('patient_id', ghostPatientIds);

    if (recordsError) {
      console.error('[demoDataService] Erro ao deletar growth_records:', recordsError);
      errors.push(recordsError);
    }

    // 3. Deletar mensagens de chat
    const { error: chatsError } = await supabase
      .from('chats')
      .delete()
      .in('from_id', ghostPatientIds);

    if (chatsError) {
      console.error('[demoDataService] Erro ao deletar chats:', chatsError);
      errors.push(chatsError);
    }

    // 4. Deletar itens de refeições
    const { data: mealsData } = await supabase
      .from('meals')
      .select('id')
      .in('patient_id', ghostPatientIds);

    if (mealsData && mealsData.length > 0) {
      const mealIds = mealsData.map(m => m.id);
      const { error: itemsError } = await supabase
        .from('meal_items')
        .delete()
        .in('meal_id', mealIds);

      if (itemsError) {
        console.error('[demoDataService] Erro ao deletar meal_items:', itemsError);
        errors.push(itemsError);
      }
    }

    // 5. Deletar refeições
    const { error: mealsError } = await supabase
      .from('meals')
      .delete()
      .in('patient_id', ghostPatientIds);

    if (mealsError) {
      console.error('[demoDataService] Erro ao deletar meals:', mealsError);
      errors.push(mealsError);
    }

    // 6. Deletar pacientes fantasmas
    const { error: patientsError } = await supabase
      .from('user_profiles')
      .delete()
      .in('id', ghostPatientIds);

    if (patientsError) {
      console.error('[demoDataService] Erro ao deletar pacientes:', patientsError);
      errors.push(patientsError);
    } else {
      deletedCount = ghostPatients.length;
    }

    // 7. Limpar refeições do usuário atual criadas hoje (reset "Perfect Day")
    // SAFETY: Apenas refeições geradas automaticamente de HOJE são deletadas
    // Isso atua como "Daily Reset" sem afetar histórico real do usuário
    const today = format(new Date(), 'yyyy-MM-dd');
    const { error: todayMealsError } = await supabase
      .from('meals')
      .delete()
      .eq('patient_id', nutritionistId)
      .eq('meal_date', today)
      .or('notes.ilike.%gerada automaticamente%,notes.ilike.%Refeição gerada automaticamente%');

    if (todayMealsError) {
      console.error('[demoDataService] Erro ao limpar refeições de hoje:', todayMealsError);
      errors.push(todayMealsError);
    }

    // 8. Limpar conquistas do usuário atual (reset gamificação)
    const { error: achievementsError } = await supabase
      .from('user_achievements')
      .delete()
      .eq('user_id', nutritionistId);

    if (achievementsError) {
      console.error('[demoDataService] Erro ao limpar conquistas:', achievementsError);
      errors.push(achievementsError);
    }

    if (errors.length > 0) {
      return {
        data: { deletedPatients: deletedCount },
        error: { message: `Alguns erros ocorreram: ${errors.length}`, errors }
      };
    }

    console.log('[demoDataService] Limpeza concluída:', {
      deletedPatients: deletedCount,
      deletedMeals: mealsData?.length || 0
    });

    return {
      data: {
        deletedPatients: deletedCount,
        deletedMeals: mealsData?.length || 0,
        deletedRecords: ghostPatientIds.length
      },
      error: null
    };
  } catch (error) {
    console.error('[demoDataService] Erro inesperado na limpeza:', error);
    return { data: null, error };
  }
}

/**
 * Desbloqueia uma conquista aleatória para o usuário
 * @param {string} userId - UUID do usuário
 * @returns {Promise<{success: boolean, achievement: object|null, message: string}>}
 */
export async function unlockRandomAchievement(userId) {
  try {
    // 1. Buscar TODAS as conquistas disponíveis
    const { data: allAchievements, error: achievementsError } = await supabase
      .from('achievements')
      .select('id, name, description, icon_name')
      .order('id', { ascending: true });

    if (achievementsError) {
      console.error('[demoDataService] Erro ao buscar conquistas:', achievementsError);
      return {
        success: false,
        achievement: null,
        message: 'Erro ao buscar conquistas disponíveis'
      };
    }

    if (!allAchievements || allAchievements.length === 0) {
      return {
        success: false,
        achievement: null,
        message: 'Nenhuma conquista disponível no sistema'
      };
    }

    // 2. Buscar conquistas já desbloqueadas pelo usuário
    const { data: userAchievements, error: userAchievementsError } = await supabase
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', userId);

    if (userAchievementsError) {
      console.error('[demoDataService] Erro ao buscar conquistas do usuário:', userAchievementsError);
      return {
        success: false,
        achievement: null,
        message: 'Erro ao verificar conquistas do usuário'
      };
    }

    const unlockedIds = new Set((userAchievements || []).map(a => a.achievement_id));

    // 3. Filtrar conquistas disponíveis (não desbloqueadas)
    const availableAchievements = allAchievements.filter(
      achievement => !unlockedIds.has(achievement.id)
    );

    if (availableAchievements.length === 0) {
      return {
        success: false,
        achievement: null,
        message: 'Todas as conquistas já foram desbloqueadas!'
      };
    }

    // 4. Selecionar uma conquista aleatória
    const randomIndex = Math.floor(Math.random() * availableAchievements.length);
    const selectedAchievement = availableAchievements[randomIndex];

    // 5. Inserir na tabela user_achievements
    const { error: insertError } = await supabase
      .from('user_achievements')
      .insert({
        user_id: userId,
        achievement_id: selectedAchievement.id
      });

    if (insertError) {
      console.error('[demoDataService] Erro ao desbloquear conquista:', insertError);
      return {
        success: false,
        achievement: null,
        message: 'Erro ao salvar a conquista'
      };
    }

    console.log('[demoDataService] Conquista desbloqueada:', selectedAchievement.name);

    return {
      success: true,
      achievement: selectedAchievement,
      message: `Conquista "${selectedAchievement.name}" desbloqueada!`
    };
  } catch (error) {
    console.error('[demoDataService] Erro inesperado ao desbloquear conquista:', error);
    return {
      success: false,
      achievement: null,
      message: 'Erro inesperado ao desbloquear conquista'
    };
  }
}

