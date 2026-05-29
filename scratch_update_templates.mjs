import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://afyoidxrshkmplxhcyeh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmeW9pZHhyc2hrbXBseGhjeWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTY1MDYsImV4cCI6MjA3MDAzMjUwNn0.xt3aH-MBg3N_BPpX8w8EpxpETWhlc0RiQsM-4T5AwsE";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const baseJsonStr = `{"sections":[{"id":"dados_sociais","icon":"User","title":"Dados Sociais e Pessoais","fields":[{"id":"profissao","type":"text","label":"Profissão","placeholder":"Ex: Engenheiro, Professor, etc."},{"id":"estado_civil","type":"select","label":"Estado Civil","options":["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União Estável"]},{"id":"com_quem_mora","type":"text","label":"Com quem mora?","placeholder":"Ex: Sozinho, com família, com cônjuge, etc."},{"id":"renda_familiar","type":"select","label":"Faixa de Renda Familiar (opcional)","options":["Até R$ 1.500","R$ 1.500 a R$ 3.000","R$ 3.000 a R$ 4.500","R$ 4.500 a R$ 6.000","R$ 6.000 a R$ 10.000","Acima de R$ 10.000"]}]},{"id":"historico_clinico","icon":"FileHeart","title":"Histórico Clínico","fields":[{"id":"queixa_principal","rows":3,"type":"textarea","label":"Queixa Principal / Motivo da Consulta","placeholder":"Descreva o principal motivo que trouxe o paciente à consulta"},{"id":"objetivo","type":"checkboxGroup","label":"Objetivo do Tratamento","options":["Emagrecimento","Ganho de massa muscular","Controle de doença crônica","Melhora da saúde geral","Preparo para cirurgia","Tratamento de transtorno alimentar","Outro"]},{"id":"objetivo_outro","type":"text","label":"Especifique outro objetivo (se marcou)","conditional":{"field":"objetivo","includes":"Outro"}},{"id":"patologias","type":"checkboxGroup","label":"Doenças/Patologias Atuais","options":["Diabetes Tipo 1","Diabetes Tipo 2","Hipertensão","Dislipidemia","Obesidade","Hipotireoidismo","Hipertireoidismo","Doença Renal","Doença Hepática","Doença Cardiovascular","Gastrite/Úlcera","Refluxo","Síndrome do Intestino Irritável","Doença Celíaca","Intolerância à Lactose","Outro"]},{"id":"patologias_outras","rows":2,"type":"textarea","label":"Outras doenças (especifique)"},{"id":"medicamentos","rows":3,"type":"textarea","label":"Medicamentos em Uso","placeholder":"Liste todos os medicamentos, suplementos e vitaminas que está tomando"},{"id":"cirurgias","rows":2,"type":"textarea","label":"Cirurgias Anteriores","placeholder":"Descreva cirurgias realizadas e o ano aproximado"},{"id":"historico_familiar","type":"checkboxGroup","label":"Histórico Familiar de Doenças","options":["Diabetes","Hipertensão","Doenças Cardiovasculares","Obesidade","Câncer","Doenças Renais","Outro"]},{"id":"alergias","rows":2,"type":"textarea","label":"Alergias Alimentares","placeholder":"Liste alergias comprovadas (não confundir com intolerâncias)"},{"id":"intolerancias","rows":2,"type":"textarea","label":"Intolerâncias Alimentares","placeholder":"Ex: Lactose, Glúten, Frutose, etc."}]},{"id":"estilo_vida","icon":"Heart","title":"Estilo de Vida","fields":[{"id":"tabagismo","type":"radio","label":"Fuma?","options":["Não","Sim, atualmente","Ex-fumante"]},{"id":"tabagismo_detalhes","type":"text","label":"Quantidade/Tempo","conditional":{"field":"tabagismo","value":"Sim, atualmente"},"placeholder":"Ex: 10 cigarros/dia há 5 anos"},{"id":"etilismo","type":"radio","label":"Consome bebidas alcoólicas?","options":["Não","Socialmente","Regularmente"]},{"id":"etilismo_frequencia","type":"text","label":"Frequência e Quantidade","conditional":{"field":"etilismo","excludes":"Não"},"placeholder":"Ex: 2 cervejas/semana"},{"id":"sono_horas","type":"number","label":"Quantas horas dorme por noite?","placeholder":"Ex: 7"},{"id":"sono_qualidade","type":"radio","label":"Qualidade do Sono","options":["Boa","Regular","Ruim","Insônia"]},{"id":"atividade_fisica","type":"radio","label":"Pratica atividade física?","options":["Não","Sim"]},{"id":"atividade_fisica_tipo","type":"text","label":"Tipo de Atividade","conditional":{"field":"atividade_fisica","value":"Sim"},"placeholder":"Ex: Musculação, Corrida, Natação, etc."},{"id":"atividade_fisica_frequencia","type":"select","label":"Frequência Semanal","options":["1-2x/semana","3-4x/semana","5-6x/semana","Todos os dias"],"conditional":{"field":"atividade_fisica","value":"Sim"}},{"id":"atividade_fisica_duracao","type":"text","label":"Duração por sessão","conditional":{"field":"atividade_fisica","value":"Sim"},"placeholder":"Ex: 60 minutos"},{"id":"ingestao_agua","type":"text","label":"Ingestão de Água Diária (aproximada)","placeholder":"Ex: 1,5 litros ou 6 copos"}]},{"id":"comportamento_alimentar","icon":"Utensils","title":"Comportamento Alimentar","fields":[{"id":"refeicoes_dia","type":"select","label":"Quantas refeições faz por dia?","options":["1-2","3","4","5","6 ou mais"]},{"id":"horarios_regulares","type":"radio","label":"Os horários das refeições são regulares?","options":["Sim","Não"]},{"id":"quem_cozinha","type":"select","label":"Quem prepara as refeições?","options":["Eu mesmo(a)","Familiar","Restaurante/Delivery","Misto"]},{"id":"come_fora_frequencia","type":"select","label":"Frequência de refeições fora de casa","options":["Raramente","1-2x/semana","3-4x/semana","Diariamente"]},{"id":"preferencias","rows":2,"type":"textarea","label":"Preferências Alimentares","placeholder":"Alimentos que gosta muito"},{"id":"aversoes","rows":2,"type":"textarea","label":"Aversões Alimentares","placeholder":"Alimentos que não gosta ou não come"},{"id":"restricoes_alimentares","type":"checkboxGroup","label":"Restrições Alimentares (voluntárias)","options":["Vegetariano","Vegano","Sem glúten (opção)","Sem lactose (opção)","Low carb","Cetogênica","Jejum intermitente","Nenhuma"]},{"id":"mastigacao","type":"radio","label":"Como é sua mastigação?","options":["Normal","Rápida/Come muito rápido","Dificuldade para mastigar"]},{"id":"compulsao","type":"radio","label":"Tem episódios de compulsão alimentar?","options":["Não","Às vezes","Frequentemente"]},{"id":"beliscar","type":"radio","label":"Costuma beliscar entre as refeições?","options":["Não","Às vezes","Frequentemente"]}]},{"id":"rastreamento_metabolico","icon":"Activity","title":"Rastreamento Metabólico e Sintomas","fields":[{"id":"sintomas","type":"checkboxGroup","label":"Sintomas Frequentes (marque os que se aplicam)","options":["Dor de cabeça","Azia/Refluxo","Constipação (intestino preso)","Diarreia","Gases/Distensão abdominal","Cansaço excessivo","Insônia","Ansiedade","Depressão","Queda de cabelo","Unhas frágeis","Pele seca","Inchaço (edema)","Cãibras","Nenhum"]},{"id":"funcionamento_intestinal","type":"select","label":"Funcionamento Intestinal (evacuações/dia)","options":["Menos de 1x/dia","1x/dia","2x/dia","3 ou mais/dia","Irregular"]}]}]}`;

const getBase = () => JSON.parse(baseJsonStr);

const anamneseMulher = getBase();
anamneseMulher.sections.find(s => s.id === 'historico_clinico').fields.push(
    {"id":"saude_mulher_sop_endometriose","type":"radio","label":"Tem diagnóstico de SOP (Síndrome do Ovário Policístico) ou Endometriose?","options":["Não","Sim, SOP","Sim, Endometriose","Ambos"]},
    {"id":"saude_mulher_gestacional","type":"text","label":"Histórico gestacional (Gestações, partos, abortos)?","placeholder":"Ex: G1 P1 A0"},
    {"id":"saude_mulher_climatério","type":"radio","label":"Está na menopausa ou climatério?","options":["Não","Sim, climatério","Sim, menopausa"]},
    {"id":"saude_mulher_fogachos","type":"checkboxGroup","label":"Sente sintomas associados (se aplicável)?","options":["Fogachos (Ondas de calor)","Ressecamento vaginal","Alterações de humor intensas","Insônia relacionada","Nenhum"],"conditional":{"field":"saude_mulher_climatério","excludes":"Não"}}
);
anamneseMulher.sections.find(s => s.id === 'rastreamento_metabolico').fields.push(
    {"id":"saude_mulher_contraceptivo","type":"radio","label":"Uso de contraceptivo oral, DIU ou outro método hormonal?","options":["Não","Pílula anticoncepcional","DIU hormonal (Mirena/Kyleena)","DIU de Cobre/Prata (Não hormonal)","Implante (Implanon)","Injeção","Outro"]},
    {"id":"saude_mulher_contraceptivo_nome","type":"text","label":"Qual o nome do contraceptivo?","conditional":{"field":"saude_mulher_contraceptivo","excludes":"Não"}},
    {"id":"saude_mulher_ciclo","type":"radio","label":"Como é a regularidade do ciclo menstrual?","options":["Regular","Irregular","Ausente (amenorreia)","Não se aplica (Menopausa/Histerectomia)"]},
    {"id":"saude_mulher_fluxo","type":"select","label":"Como é o fluxo menstrual?","options":["Leve","Moderado","Intenso","Muito intenso"]},
    {"id":"saude_mulher_tpm","type":"checkboxGroup","label":"Presença de sintomas na TPM?","options":["Sem TPM significativa","Cólicas fortes","Irritabilidade / Alterações de humor","Compulsão por doces/carboidratos","Inchaço / Retenção de líquidos","Dor nas mamas","Fadiga","Enxaqueca"]}
);

const anamneseHomem = getBase();
anamneseHomem.sections.find(s => s.id === 'historico_clinico').fields.push(
    {"id":"saude_homem_prostata","type":"radio","label":"Histórico de exames de próstata (PSA) e testosterona recente?","options":["Sim, normais","Sim, com alterações","Não realizei recentemente"]},
    {"id":"saude_homem_calvicie","type":"radio","label":"Histórico de calvície (alopecia androgenética) acentuada recentemente?","options":["Não","Sim"]},
    {"id":"saude_homem_foco","type":"checkboxGroup","label":"Foco atual mais urgente","options":["Redução de gordura visceral (barriga)","Aumento de massa magra","Melhora da energia e disposição","Melhora de exames (Colesterol, Glicemia)","Outro"]}
);
anamneseHomem.sections.find(s => s.id === 'rastreamento_metabolico').fields.push(
    {"id":"saude_homem_libido","type":"radio","label":"Queixas relacionadas à libido ou disposição física?","options":["Sem queixas, tudo normal","Queda na libido","Falta de energia/disposição ao longo do dia","Dificuldade de ereção"]}
);

const anamnesePediatrica = {
    "sections": [
        {
            "id": "dados_crianca_pais",
            "icon": "User",
            "title": "Dados da Criança e Pais",
            "fields": [
                {"id":"nome_pais","type":"text","label":"Nome dos responsáveis","placeholder":"Ex: Maria e João"},
                {"id":"idade_gestacional","type":"text","label":"Idade gestacional ao nascer","placeholder":"Ex: 39 semanas (a termo), ou prematuro de 34 sem"},
                {"id":"peso_nascer","type":"text","label":"Peso e comprimento ao nascer","placeholder":"Ex: 3,2kg e 50cm"},
                {"id":"aleitamento","type":"select","label":"Tempo de aleitamento materno exclusivo","options":["Não foi amamentado","Até 1 mês","Até 3 meses","Até 6 meses","Mais de 6 meses"]},
                {"id":"aleitamento_total","type":"text","label":"Tempo de aleitamento materno total","placeholder":"Ex: Até os 2 anos"},
                {"id":"uso_formula","type":"radio","label":"Fez ou faz uso de fórmula infantil?","options":["Não","Sim"]},
                {"id":"qual_formula","type":"text","label":"Qual fórmula?","conditional":{"field":"uso_formula","value":"Sim"},"placeholder":"Ex: Aptamil 1, Nan Comfor 2"}
            ]
        },
        {
            "id": "historico_pediatrico",
            "icon": "FileHeart",
            "title": "Histórico Clínico e Desenvolvimento",
            "fields": [
                {"id":"queixa_principal","rows":3,"type":"textarea","label":"Queixa Principal / Motivo da Consulta"},
                {"id":"doencas_infancia","type":"checkboxGroup","label":"Doenças ou condições diagnosticadas","options":["APLV (Alergia à Proteína do Leite de Vaca)","Intolerância à Lactose","Asma / Bronquite","Dermatite Atópica","Refluxo Gastroesofágico (DRGE)","Autismo (TEA)","TDAH","Nenhuma","Outra"]},
                {"id":"doencas_outras","type":"text","label":"Outra doença (se marcou)","conditional":{"field":"doencas_infancia","includes":"Outra"}},
                {"id":"medicamentos_ped","rows":2,"type":"textarea","label":"Medicamentos ou Suplementos em Uso","placeholder":"Ex: Vitamina D, Ferro, etc."},
                {"id":"historico_familiar","type":"checkboxGroup","label":"Histórico Familiar (Pais/Avós)","options":["Obesidade","Diabetes","Alergias Alimentares","Doença Celíaca"]}
            ]
        },
        {
            "id": "comportamento_alimentar_ped",
            "icon": "Utensils",
            "title": "Comportamento Alimentar",
            "fields": [
                {"id":"introducao_alimentar","type":"select","label":"Como foi/está sendo a introdução alimentar?","options":["Ainda não iniciou (Abaixo de 6m)","Tradicional (Papinhas)","BLW (Pedaços)","BLISS / Participativa (Misto)"]},
                {"id":"seletividade","type":"radio","label":"A criança apresenta seletividade alimentar ou neofobia (recusa de novos alimentos)?","options":["Não","Leve (recusa alguns grupos)","Moderada","Severa (come pouquíssimos alimentos)"]},
                {"id":"quem_acompanha","type":"text","label":"Quem são os cuidadores principais que realizam as refeições com a criança?","placeholder":"Ex: Mãe, Baba, Avó"},
                {"id":"local_refeicao","type":"checkboxGroup","label":"Onde a criança faz as refeições?","options":["Na mesa de jantar","No cadeirão","No sofá / Cama","Assistindo TV/Celular/Tablet","Correndo pela casa"]},
                {"id":"alimentos_preferidos","rows":2,"type":"textarea","label":"Alimentos Preferidos"},
                {"id":"alimentos_recusados","rows":2,"type":"textarea","label":"Alimentos Recusados (Não come de jeito nenhum)"}
            ]
        },
        {
            "id": "estilo_vida_ped",
            "icon": "Heart",
            "title": "Estilo de Vida e Rotina",
            "fields": [
                {"id":"escola_periodo","type":"select","label":"Período escolar","options":["Não frequenta escola/creche","Meio período (Manhã)","Meio período (Tarde)","Período Integral"]},
                {"id":"lancheira","type":"radio","label":"Quem prepara a lancheira escolar?","options":["A família manda de casa","Come a comida/lanche da escola/cantina","Não se aplica"]},
                {"id":"telas","type":"select","label":"Tempo de tela diário (TV, Celular, Tablet)","options":["Zero","Até 1 hora","1 a 3 horas","Mais de 3 horas"]},
                {"id":"sono_ped","type":"radio","label":"Como é o sono da criança?","options":["Dorme bem a noite toda","Acorda várias vezes","Dificuldade para pegar no sono","Respira pela boca / Ronca"]},
                {"id":"intestino_ped","type":"radio","label":"Funcionamento Intestinal","options":["Normal / Diário","Ressecado / Dor ao evacuar (Constipação)","Diarreia frequente"]}
            ]
        }
    ]
};

const anamneseIdoso = getBase();
anamneseIdoso.sections.find(s => s.id === 'historico_clinico').fields.push(
    {"id":"idoso_quedas","type":"radio","label":"Histórico de quedas recentes ou perda de força (sarcopenia)?","options":["Não","Sim, pernas fracas","Sim, quedas recentes","Sim, dificuldade para levantar da cadeira"]}
);
anamneseIdoso.sections.find(s => s.id === 'comportamento_alimentar').fields.push(
    {"id":"idoso_mastigacao","type":"radio","label":"Saúde bucal e mastigação","options":["Dentes naturais, mastiga bem","Usa prótese parcial/total bem adaptada","Usa prótese mal adaptada / Dificuldade para mastigar","Apenas alimentos pastosos/líquidos"]},
    {"id":"idoso_degluticao","type":"radio","label":"Apresenta engasgos frequentes (disfagia) ao beber líquidos ou comer?","options":["Não","Sim, com líquidos","Sim, com sólidos","Sim, com ambos"]},
    {"id":"idoso_preparo","type":"radio","label":"Mora sozinho? Quem prepara as refeições e faz as compras?","options":["Mora e faz tudo sozinho","Mora com familiar que ajuda","Tem cuidador/diarista","Mora em instituição"]},
    {"id":"idoso_paladar","type":"radio","label":"Alterações no paladar ou olfato recentemente?","options":["Não","Sente a comida sem gosto","Relata que tudo está amargo/salgado"]}
);
anamneseIdoso.sections.find(s => s.id === 'rastreamento_metabolico').fields.push(
    {"id":"idoso_laxantes","type":"radio","label":"Hábitos intestinais: Uso crônico de laxantes?","options":["Não uso","Uso esporádico","Uso crônico/frequente"]}
);

const anamneseEsportiva = {
    "sections": [
        {
            "id": "dados_basicos_esp",
            "icon": "User",
            "title": "Dados e Objetivos",
            "fields": [
                {"id":"profissao","type":"text","label":"Profissão/Ocupação","placeholder":"Para avaliar gasto calórico não relacionado ao exercício"},
                {"id":"rotina_trabalho","type":"radio","label":"No seu trabalho/dia a dia, você é mais:","options":["Sedentário (maior parte do tempo sentado)","Ativo (anda muito, sobe escada, carrega peso)"]},
                {"id":"objetivo_esp","type":"checkboxGroup","label":"Objetivo Principal","options":["Hipertrofia (Ganho de massa muscular)","Redução de percentual de gordura (Cutting)","Melhora de performance atlética","Recomposição corporal (Troca de gordura por massa)","Preparo para competição"]}
            ]
        },
        {
            "id": "treino_rotina",
            "icon": "Activity",
            "title": "Rotina de Treino",
            "fields": [
                {"id":"modalidades","type":"text","label":"Quais modalidades esportivas você pratica?","placeholder":"Ex: Musculação, Crossfit, Jiu-Jitsu, Corrida"},
                {"id":"tempo_pratica","type":"select","label":"Tempo de prática ininterrupta do esporte principal?","options":["Iniciante (Menos de 6 meses)","Intermediário (6 meses a 2 anos)","Avançado (Mais de 2 anos)"]},
                {"id":"frequencia_treino","type":"select","label":"Frequência de treino semanal","options":["1 a 2x","3 a 4x","5 a 6x","Todos os dias","Mais de 1x ao dia (Bi-diário)"]},
                {"id":"horario_treino","type":"text","label":"Horário habitual do treino","placeholder":"Ex: Manhã (6h), Noite (19h)"},
                {"id":"duracao_treino","type":"text","label":"Duração média de cada sessão","placeholder":"Ex: 1 hora e 30 min"},
                {"id":"cardio","type":"radio","label":"Faz treinamento cardiovascular (Aeróbico)?","options":["Não","Sim, após o treino de força","Sim, em horário separado","Apenas aeróbico"]},
                {"id":"cardio_tempo","type":"text","label":"Volume de cardio semanal (minutos aprox.)","conditional":{"field":"cardio","excludes":"Não"},"placeholder":"Ex: 120 minutos/semana"}
            ]
        },
        {
            "id": "nutricao_esportiva",
            "icon": "Utensils",
            "title": "Nutrição e Suplementação",
            "fields": [
                {"id":"pre_treino_refeicao","rows":2,"type":"textarea","label":"O que costuma comer/beber antes do treino? E quanto tempo antes?","placeholder":"Ex: Pão com ovo 1h antes do treino"},
                {"id":"pos_treino_refeicao","rows":2,"type":"textarea","label":"O que costuma comer/beber após o treino?","placeholder":"Ex: Whey protein e janta 40 min depois"},
                {"id":"suplementos","type":"checkboxGroup","label":"Quais suplementos utiliza atualmente?","options":["Whey Protein / Proteína Vegetal","Creatina","Pré-treino (Cafeína, Beta-alanina)","Hipercalórico","Aminoácidos (BCAA, EAA)","Ômega 3","Multivitamínico","Nenhum"]},
                {"id":"suplementos_detalhes","rows":2,"type":"textarea","label":"Se usa suplementos, detalhe marcas e dosagens (opcional)"},
                {"id":"hidratacao_treino","type":"text","label":"Consumo de água DURANTE o treino","placeholder":"Ex: Bebo 1 litro de água"}
            ]
        },
        {
            "id": "recuperacao",
            "icon": "Heart",
            "title": "Recuperação e Sintomas",
            "fields": [
                {"id":"fadiga_treino","type":"radio","label":"Sente fadiga extrema ou queda de rendimento durante os treinos?","options":["Nunca","Raramente","Frequentemente"]},
                {"id":"dor_tardia","type":"radio","label":"Como é a dor muscular tardia (DMIT)?","options":["Recupero rápido, quase não sinto","Dor normal que dura 1-2 dias","Dor muito intensa que atrapalha treinar o mesmo músculo dias depois"]},
                {"id":"sono_recuperacao","type":"select","label":"Qualidade do sono para recuperação","options":["Boa, acordo descansado","Regular","Ruim, acordo cansado"]},
                {"id":"ergogenicos","type":"radio","label":"Faz uso de recursos ergogênicos farmacológicos (Esteroides anabolizantes, SARMs, etc)?","options":["Não, sou natural","Sim, com acompanhamento médico","Sim, por conta própria","Já usei no passado, mas parei"]}
            ]
        }
    ]
};

const rastreamentoMetabolicoIsolado = {
    "sections": [
        {
            "id": "rastreamento_escala",
            "icon": "Activity",
            "title": "Rastreamento Metabólico - Como você se sentiu nos últimos 15 dias?",
            "fields": [
                {"id":"instrucao_rastreio","type":"text","label":"Instruções","placeholder":"Avalie os sintomas abaixo de 0 (Nunca) a 5 (Muito frequente/Intenso). Não digite texto, apenas escolha o número.","readonly":true},
                {"id":"rast_dor_cabeca","type":"select","label":"Dor de cabeça / Enxaqueca","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_cansaco","type":"select","label":"Fadiga crônica / Cansaço mesmo após dormir","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_ansiedade","type":"select","label":"Ansiedade / Irritabilidade excessiva","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_inchaco","type":"select","label":"Retenção de líquidos / Inchaço nas extremidades","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_gases","type":"select","label":"Gases excessivos / Distensão abdominal","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_azia","type":"select","label":"Azia / Refluxo / Má digestão","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_articulacoes","type":"select","label":"Dores articulares / Musculares sem motivo","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_pele","type":"select","label":"Acne / Pele oleosa / Eczema","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_queda_cabelo","type":"select","label":"Queda de cabelo excessiva / Unhas fracas","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]},
                {"id":"rast_doces","type":"select","label":"Vontade incontrolável de doces ou carboidratos","options":["0 - Nunca","1","2","3","4","5 - Muito frequente"]}
            ]
        }
    ]
};

const questionarioPreConsulta = {
    "sections": [
        {
            "id": "triagem_pre_consulta",
            "icon": "ClipboardList",
            "title": "Triagem Rápida Pré-Consulta",
            "fields": [
                {"id":"triagem_objetivo","rows":2,"type":"textarea","label":"Qual é o seu principal objetivo com o acompanhamento nutricional?","placeholder":"Ex: Quero emagrecer 5kg, melhorar exames de colesterol, etc."},
                {"id":"triagem_peso_altura","type":"text","label":"Qual é o seu peso e altura aproximados?","placeholder":"Ex: 75kg, 1,70m"},
                {"id":"triagem_doencas_graves","rows":2,"type":"textarea","label":"Possui alguma doença diagnosticada ou alteração grave em exames recentes?","placeholder":"Ex: Pré-diabetes, hipertensão, etc. (Deixe em branco se nenhuma)."},
                {"id":"triagem_alergias","type":"text","label":"Possui alergias alimentares graves ou doença celíaca?","placeholder":"Ex: Sou alérgico a amendoim. (Deixe em branco se nenhuma)."},
                {"id":"triagem_restricao","rows":2,"type":"textarea","label":"O que você definitivamente NÃO come de jeito nenhum?","placeholder":"Alimentos que você detesta ou não consome por opção (ex: veganismo)."},
                {"id":"triagem_exames","type":"radio","label":"Você possui exames de sangue recentes (últimos 6 meses)?","options":["Sim, levarei na consulta / enviarei antes","Não possuo exames recentes"]}
            ]
        }
    ]
};

async function run() {
    console.log("Updating existing templates...");

    const r1 = await supabase.from('anamnesis_templates').update({ sections: anamneseMulher }).eq('id', 'fc4f4624-5e57-4274-b4cb-4ffa1eb6667f');
    if (r1.error) console.error("Error updating Mulher:", r1.error);
    else console.log("Mulher updated.");

    const r2 = await supabase.from('anamnesis_templates').update({ sections: anamneseHomem }).eq('id', '6af77004-11e1-4e7a-933c-1e54a152f95b');
    if (r2.error) console.error("Error updating Homem:", r2.error);
    else console.log("Homem updated.");

    const r3 = await supabase.from('anamnesis_templates').update({ sections: anamnesePediatrica }).eq('id', '9d835087-31c0-4f3b-bb42-068fdc05be46');
    if (r3.error) console.error("Error updating Pediatrica:", r3.error);
    else console.log("Pediatrica updated.");

    const r4 = await supabase.from('anamnesis_templates').update({ sections: anamneseIdoso }).eq('id', '93e81d6d-08dc-4c18-bfaa-8afbff6d8daa');
    if (r4.error) console.error("Error updating Idoso:", r4.error);
    else console.log("Idoso updated.");

    console.log("Inserting new templates...");

    const r5 = await supabase.from('anamnesis_templates').insert({
        title: 'Anamnese Esportiva e Hipertrofia',
        description: 'Focado em praticantes assíduos de musculação, crossfit e esportes de endurance.',
        sections: anamneseEsportiva,
        is_system_default: true,
        is_active: true
    });
    if (r5.error) console.error("Error inserting Esportiva:", r5.error);
    else console.log("Esportiva inserted.");

    const r6 = await supabase.from('anamnesis_templates').insert({
        title: 'Rastreamento Metabólico Isolado',
        description: 'Formulário curto apenas para avaliar a toxicidade e carga inflamatória. Ideal para enviar ao paciente antes do retorno.',
        sections: rastreamentoMetabolicoIsolado,
        is_system_default: true,
        is_active: true
    });
    if (r6.error) console.error("Error inserting Rastreamento:", r6.error);
    else console.log("Rastreamento inserted.");

    const r7 = await supabase.from('anamnesis_templates').insert({
        title: 'Questionário de Rastreio (Pré-Consulta)',
        description: 'Triagem rápida. Ideal para enviar assim que o paciente agenda a primeira consulta.',
        sections: questionarioPreConsulta,
        is_system_default: true,
        is_active: true
    });
    if (r7.error) console.error("Error inserting Triagem:", r7.error);
    else console.log("Triagem inserted.");

    console.log("All done.");
}

run();
