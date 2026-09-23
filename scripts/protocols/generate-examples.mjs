// Content for editable Nello protocol examples. Run: node scripts/protocols/generate-examples.mjs
import { writeFileSync } from 'node:fs';

const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${sql(JSON.stringify(value))}::jsonb`;
const option = (...labels) => labels.map((label, index) => ({ label, value: `op_${index + 1}` }));
const field = (id, label, type = 'text', extra = {}) => ({ id, label, type, required: false, ...extra });
const section = (id, title, fields) => ({ id, title, fields });

const anamneses = [
  {
    title: 'Nello | Primeira consulta nutricional - adulto',
    description: 'Modelo editável de coleta inicial. Confirmar informações, medidas, exames e conduta com o nutricionista; não gera diagnóstico automático.',
    sections: [
      section('identificacao', 'Contexto e motivo da consulta', [
        field('ocupacao', 'Ocupação e rotina de trabalho'),
        field('motivo', 'Qual o motivo da consulta e o que espera do acompanhamento?', 'textarea', { required: true }),
        field('objetivos', 'Quais objetivos deseja discutir?', 'checkbox', { options: option('Melhorar hábitos alimentares', 'Acompanhar condição clínica', 'Desempenho esportivo', 'Gestação ou lactação', 'Outro') }),
        field('acesso', 'Há limitações de orçamento, tempo, acesso a alimentos ou cozinha?', 'textarea'),
      ]),
      section('clinica', 'História clínica e segurança', [
        field('diagnosticos', 'Condições diagnosticadas e acompanhamento em curso', 'textarea', { required: true }),
        field('historico_familiar', 'História familiar relevante (ex.: diabetes, hipertensão, doença cardiovascular)', 'textarea'),
        field('medicamentos', 'Medicamentos e suplementos: nome, dose e frequência', 'textarea'),
        field('tem_alergia', 'Há alergia alimentar confirmada?', 'radio', { options: option('Sim', 'Não', 'Em investigação'), required: true }),
        field('alergias', 'Qual alimento e qual reação foi observada?', 'textarea', { clinical_flag_key: 'alergias', conditional_logic: { field_id: 'tem_alergia', operator: 'equals', value: 'op_1' } }),
        field('intolerancias', 'Intolerâncias, restrições médicas e sintomas após alimentos', 'textarea', { clinical_flag_key: 'intolerancias' }),
        field('cirurgias', 'Cirurgias, internações e alterações recentes de saúde', 'textarea'),
        field('exames', 'Exames laboratoriais disponíveis e data de coleta', 'textarea'),
      ]),
      section('avaliacao', 'Avaliação nutricional', [
        field('peso_historia', 'Mudanças de peso nos últimos meses e contexto', 'textarea'),
        field('medidas', 'Peso, estatura e outras medidas aferidas: valor, unidade e data', 'textarea'),
        field('apetite', 'Como está o apetite?', 'radio', { options: option('Habitual', 'Reduzido', 'Aumentado', 'Varia muito') }),
        field('digestao', 'Mastigação, deglutição, refluxo e hábito intestinal', 'textarea'),
        field('mobilidade', 'Mobilidade e nível de atividade habitual', 'select', { options: option('Acamado', 'Mobilidade reduzida', 'Deambula', 'Atividade intensa') }),
      ]),
      section('alimentacao', 'Inquérito alimentar e rotina', [
        field('recordatorio', 'Descreva um dia habitual: horários, alimentos, preparações, porções e bebidas', 'textarea', { required: true }),
        field('fins_semana', 'O padrão muda em fins de semana ou dias de trabalho?', 'textarea'),
        field('preferencias', 'Preferências, aversões, práticas culturais ou religiosas', 'textarea'),
        field('agua', 'Água e outras bebidas: quantidade aproximada e frequência', 'textarea'),
        field('ultraprocessados', 'Frequência de produtos ultraprocessados e refeições fora de casa', 'textarea'),
        field('cozinha', 'Quem compra e prepara as refeições? Que recursos estão disponíveis?', 'textarea'),
      ]),
      section('habitos', 'Hábitos e plano compartilhado', [
        field('atividade', 'Atividade física: tipo, duração, frequência e limitações', 'textarea'),
        field('sono', 'Sono: duração, qualidade e horários', 'textarea'),
        field('energia', 'Como avalia sua disposição no dia a dia?', 'scale_1_10'),
        field('alcool_tabaco', 'Uso de álcool e tabaco, se desejar informar', 'textarea'),
        field('prioridade', 'Qual mudança seria viável começar nesta semana?', 'textarea'),
      ]),
    ],
  },
  {
    title: 'Nello | Seguimento nutricional - evolução',
    description: 'Modelo editável para revisão de adesão, sintomas, medidas e barreiras. Avaliação e ajustes dependem do nutricionista.',
    sections: [
      section('evolucao', 'Evolução desde a última consulta', [
        field('mudancas', 'O que mudou na rotina, saúde ou tratamento?', 'textarea', { required: true }),
        field('objetivos', 'Como evoluíram os objetivos acordados?', 'textarea'),
        field('medidas', 'Medidas aferidas, unidade, data e método', 'textarea'),
        field('exames', 'Novos exames ou alterações de medicamentos e suplementos', 'textarea'),
      ]),
      section('alimentacao', 'Alimentação e tolerância', [
        field('refeicoes', 'Quais refeições funcionaram? Quais foram difíceis?', 'textarea'),
        field('recordatorio', 'Recordatório de um dia recente, incluindo horários e quantidades', 'textarea'),
        field('sintomas', 'Sintomas digestivos, apetite e saciedade desde a última consulta', 'textarea'),
        field('alergias', 'Alguma nova reação ou restrição alimentar?', 'textarea', { clinical_flag_key: 'alergias' }),
      ]),
      section('plano', 'Barreiras e próximos passos', [
        field('barreiras', 'O que dificultou o plano (custo, tempo, acesso, preparo, preferências)?', 'textarea'),
        field('atividade', 'Como foi a atividade física e o sono?', 'textarea'),
        field('ajuste', 'Que ajuste o paciente considera possível agora?', 'textarea'),
      ]),
    ],
  },
  {
    title: 'Nello | Avaliação alimentar pediátrica - responsável',
    description: 'Modelo para coleta com responsável. Exige avaliação individual por idade e estágio de desenvolvimento; não substitui curva de crescimento.',
    sections: [
      section('contexto', 'Criança e responsável', [
        field('responsavel', 'Nome e vínculo de quem está respondendo', 'text', { required: true }),
        field('motivo', 'Motivo da consulta e preocupações da família', 'textarea', { required: true }),
        field('idade', 'Idade em anos e meses (ou meses, se lactente)'),
        field('escola', 'Rotina escolar e cuidadores durante as refeições', 'textarea'),
      ]),
      section('saude', 'Saúde e crescimento', [
        field('gestacao', 'História gestacional, nascimento e prematuridade, se relevante', 'textarea'),
        field('crescimento', 'Peso, estatura/comprimento, data e curvas acompanhadas por profissional', 'textarea'),
        field('diagnosticos', 'Condições diagnosticadas, medicamentos e suplementos', 'textarea'),
        field('alergias', 'Alergias alimentares confirmadas e tipo de reação', 'textarea', { clinical_flag_key: 'alergias' }),
        field('sintomas', 'Mastigação, deglutição, evacuação e outros sintomas', 'textarea'),
      ]),
      section('alimentacao', 'História e ambiente alimentar', [
        field('aleitamento', 'Aleitamento atual ou anterior e introdução alimentar, conforme idade', 'textarea'),
        field('dia', 'Descreva um dia habitual: horários, alimentos, porções e bebidas', 'textarea', { required: true }),
        field('variedade', 'Variedade de frutas, hortaliças, feijões e outras preparações', 'textarea'),
        field('seletividade', 'Recusas, texturas aceitas e forma de oferta dos alimentos', 'textarea'),
        field('ambiente', 'Onde e com quem come? Há telas durante as refeições?', 'textarea'),
      ]),
    ],
  },
  {
    title: 'Nello | Pessoa idosa - avaliação nutricional',
    description: 'Modelo editável que destaca risco nutricional, funcionalidade e acesso à alimentação. Encaminhamentos dependem de avaliação clínica.',
    sections: [
      section('contexto', 'Contexto e rede de apoio', [
        field('motivo', 'Motivo da consulta e principais preocupações', 'textarea', { required: true }),
        field('apoio', 'Quem compra, prepara e oferece as refeições?', 'textarea'),
        field('autonomia', 'Consegue comer e preparar refeições de forma independente?', 'select', { options: option('Sim', 'Com ajuda parcial', 'Precisa de ajuda constante') }),
      ]),
      section('risco', 'Saúde e risco nutricional', [
        field('peso', 'Mudança involuntária de peso e redução de ingestão nos últimos meses', 'textarea', { required: true }),
        field('medidas', 'Peso, estatura estimada/aferida e data; registrar método', 'textarea'),
        field('doencas', 'Condições diagnosticadas e internações recentes', 'textarea'),
        field('medicamentos', 'Medicamentos e suplementos, incluindo horários', 'textarea'),
        field('mastigacao', 'Dentição/prótese, mastigação, engasgos ou dificuldade para engolir', 'textarea'),
        field('sintomas', 'Apetite, paladar, náusea, constipação e outros sintomas', 'textarea'),
      ]),
      section('dieta', 'Consumo e ambiente', [
        field('recordatorio', 'Dia alimentar habitual: refeições, preparações, consistência e porções', 'textarea', { required: true }),
        field('hidratacao', 'Bebidas e acesso à água ao longo do dia', 'textarea'),
        field('restricoes', 'Alergias, intolerâncias e restrições prescritas', 'textarea', { clinical_flag_key: 'alergias' }),
        field('acesso', 'Há dificuldade financeira, de compra ou de preparo dos alimentos?', 'textarea'),
      ]),
    ],
  },
];

const checkins = [
  {
    name: 'Nello | Acompanhamento semanal de hábitos',
    description: 'Exemplo editável para conversa sobre rotina e barreiras; respostas não representam diagnóstico ou adesão clínica automática.',
    fields: [
      ['Como foi a regularidade das refeições nesta semana? (1 a 10)', 'scale_1_10'],
      ['Conseguiu incluir frutas ou hortaliças na maioria dos dias?', 'yes_no'],
      ['Quantos dias preparou ou comeu refeições feitas em casa?', 'number', [], 'dias'],
      ['O que facilitou sua alimentação nesta semana?', 'text'],
      ['Qual foi a maior dificuldade?', 'multiple_choice', ['Tempo', 'Custo', 'Acesso', 'Preferências', 'Sintomas', 'Outra']],
      ['Gostaria de conversar sobre algum sintoma ou reação a alimento?', 'text'],
    ],
  },
  {
    name: 'Nello | Revisão breve de sintomas e plano',
    description: 'Exemplo editável de acompanhamento; sintomas persistentes exigem avaliação profissional.',
    fields: [
      ['Como avalia seu bem-estar geral hoje? (1 a 10)', 'scale_1_10'],
      ['Houve mudança de medicamento ou suplemento desde o último contato?', 'yes_no'],
      ['Notou dificuldade para mastigar, engolir ou sintomas digestivos?', 'yes_no'],
      ['Descreva mudanças ou sintomas que deseja relatar', 'text'],
      ['Qual ajuste no plano seria mais útil discutir?', 'text'],
    ],
  },
];

// source_id from active, public TACO foods. Quantities are grams, not servings.
const food = {
  rice: 'TACO-003', beans: 'TACO-550', chicken: 'TACO-403', banana: 'TACO-182',
  oats: 'TACO-007', egg: 'TACO-480', papaya: 'TACO-226', pumpkin: 'TACO-064',
  carrot: 'TACO-110', lettuce: 'TACO-078', tomato: 'TACO-157', apple: 'TACO-222',
  sweetPotato: 'TACO-088', yogurt: 'TACO-441',
};
const diet = [
  ['Café da manhã', '07:30', [[food.papaya, 120], [food.oats, 30], [food.egg, 50]]],
  ['Almoço', '12:30', [[food.rice, 100], [food.beans, 90], [food.chicken, 100], [food.carrot, 60], [food.lettuce, 30]]],
  ['Lanche', '16:00', [[food.banana, 80], [food.yogurt, 170]]],
  ['Jantar', '19:30', [[food.sweetPotato, 130], [food.egg, 100], [food.tomato, 80], [food.pumpkin, 80]]],
];
const recipes = [
  ['Nello | Salada de feijão com frango', 'Exemplo de preparação culinária. Verifique alergias, textura, porção e necessidades individuais.', 'Cozinhe o feijão e o frango, deixe amornar e misture com tomate e alface higienizados. Sirva em duas porções.', 2, [[food.beans, 180], [food.chicken, 160], [food.tomato, 100], [food.lettuce, 40]]],
  ['Nello | Creme de abóbora e cenoura', 'Exemplo de preparação. Ajuste consistência, temperos, porção e composição nutricional na avaliação individual.', 'Cozinhe abóbora e cenoura em água, bata até obter creme e aqueça novamente. Sirva em duas porções.', 2, [[food.pumpkin, 250], [food.carrot, 120]]],
];

let out = `-- Nello protocol examples: editable educational starting points, not prescriptions.\n`;
for (const item of anamneses) {
  out += `INSERT INTO public.anamnesis_templates (nutritionist_id,title,description,sections,is_system_default,is_active,version)\n`;
  out += `SELECT NULL,${sql(item.title)},${sql(item.description)},${json(item.sections)},true,true,1\n`;
  out += `WHERE NOT EXISTS (SELECT 1 FROM public.anamnesis_templates WHERE title=${sql(item.title)} AND is_system_default=true);\n`;
}
out += `UPDATE public.anamnesis_templates SET is_active=false WHERE is_system_default=true AND title NOT LIKE 'Nello | %';\n`;
out += `CREATE OR REPLACE FUNCTION private.seed_nello_protocol_examples(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $seed$\n`;
out += `DECLARE v_parent uuid; v_meal uuid; v_food uuid; BEGIN\n`;
out += `IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id=p_user AND user_type='nutritionist') THEN RETURN; END IF;\n`;
for (const item of checkins) {
  out += `IF NOT EXISTS (SELECT 1 FROM public.checkin_templates WHERE nutritionist_id=p_user AND name=${sql(item.name)}) THEN\n`;
  out += `INSERT INTO public.checkin_templates (nutritionist_id,name,description,frequency,send_time,send_days,channel,is_active,metadata) VALUES (p_user,${sql(item.name)},${sql(item.description)},'weekly','09:00',ARRAY[1],'in_app',true,'{"nello_example":true}'::jsonb) RETURNING id INTO v_parent;\n`;
  item.fields.forEach(([label, type, choices = [], unit = null], index) => {
    out += `INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,${sql(label)},${sql(type)},${json(choices)},0,${unit ? sql(unit) : 'NULL'},${index < 3},${index});\n`;
  });
  out += `END IF;\n`;
}
// Require every source food before inserting an example that depends on it.
out += `IF (SELECT count(*) FROM public.reference_foods WHERE source='TACO' AND is_active=true AND source_id IN (${Object.values(food).map(sql).join(',')})) = ${Object.values(food).length} THEN\n`;
out += `IF NOT EXISTS (SELECT 1 FROM public.diet_templates WHERE user_id=p_user AND name='Nello | Dia alimentar brasileiro - exemplo') THEN\n`;
out += `INSERT INTO public.diet_templates (user_id,name,description,tags) VALUES (p_user,'Nello | Dia alimentar brasileiro - exemplo','Modelo didático editável com alimentos do banco TACO. Quantidades ilustrativas, sem meta calórica universal. Avalie paciente, alergias, VET e prescrição antes de publicar.',ARRAY['Nello','Exemplo','Alimentos in natura']) RETURNING id INTO v_parent;\n`;
diet.forEach(([name,time,foods],index) => {
  out += `INSERT INTO public.diet_template_meals (template_id,name,time,order_index) VALUES (v_parent,${sql(name)},${sql(time)},${index}) RETURNING id INTO v_meal;\n`;
  foods.forEach(([source,quantity],i) => {
    out += `SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id=${sql(source)} AND is_active=true;\n`;
    out += `INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,${quantity},'gram',${i});\n`;
  });
});
out += `END IF;\n`;
out += `IF NOT EXISTS (SELECT 1 FROM public.meal_templates WHERE user_id=p_user AND name='Nello | Arroz, feijão, frango e salada') THEN\n`;
out += `INSERT INTO public.meal_templates (user_id,name,description,tags) VALUES (p_user,'Nello | Arroz, feijão, frango e salada','Exemplo editável de refeição brasileira. Ajuste porções e composição para cada paciente.',ARRAY['Nello','Exemplo']) RETURNING id INTO v_parent;\n`;
[[food.rice,100],[food.beans,90],[food.chicken,100],[food.tomato,80]].forEach(([source,quantity],i) => {
  out += `SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id=${sql(source)} AND is_active=true;\n`;
  out += `INSERT INTO public.meal_template_foods (meal_template_id,food_id,quantity,unit,order_index) VALUES (v_parent,v_food,${quantity},'gram',${i});\n`;
});
out += `END IF;\n`;
for (const [name,description,method,yieldQuantity,ingredients] of recipes) {
  out += `IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE user_id=p_user AND name=${sql(name)} AND is_deleted=false) THEN\n`;
  out += `INSERT INTO public.recipes (user_id,name,description,preparation_method,yield_quantity,yield_unit) VALUES (p_user,${sql(name)},${sql(description)},${sql(method)},${yieldQuantity},'porção') RETURNING id INTO v_parent;\n`;
  ingredients.forEach(([source,quantity]) => {
    out += `SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id=${sql(source)} AND is_active=true;\n`;
    out += `INSERT INTO public.recipe_ingredients (recipe_id,food_id,quantity,unit) VALUES (v_parent,v_food,${quantity},'gram');\n`;
  });
  out += `UPDATE public.recipes r SET (base_calories,base_protein,base_carbs,base_fat) = (SELECT round(sum(i.quantity * coalesce((i.food_snapshot->>'calories')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'protein')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'carbs')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'fat')::numeric,0) / 100),2) FROM public.recipe_ingredients i WHERE i.recipe_id=v_parent) WHERE r.id=v_parent;\n`;
  out += `END IF;\n`;
}
out += `END IF; END; $seed$;\n`;
out += `REVOKE ALL ON FUNCTION private.seed_nello_protocol_examples(uuid) FROM PUBLIC, anon, authenticated;\n`;
out += `CREATE OR REPLACE FUNCTION private.seed_nello_protocol_examples_on_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $trigger$ BEGIN IF NEW.user_type='nutritionist' THEN PERFORM private.seed_nello_protocol_examples(NEW.id); END IF; RETURN NEW; END; $trigger$;\n`;
out += `DROP TRIGGER IF EXISTS trg_seed_nello_protocol_examples ON public.user_profiles;\nCREATE TRIGGER trg_seed_nello_protocol_examples AFTER INSERT OR UPDATE OF user_type ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION private.seed_nello_protocol_examples_on_profile();\n`;
out += `DO $backfill$ DECLARE v_user uuid; BEGIN FOR v_user IN SELECT id FROM public.user_profiles WHERE user_type='nutritionist' LOOP PERFORM private.seed_nello_protocol_examples(v_user); END LOOP; END; $backfill$;\n`;

writeFileSync('supabase/migrations/20260923000000_protocol_examples.sql', out);
console.log(`Generated ${anamneses.length} anamneses, ${checkins.length} check-ins, ${recipes.length} recipes, one diet and one meal example.`);
export { anamneses, checkins, diet, recipes };
