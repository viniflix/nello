-- Templates de mensagem padrão (disponíveis para todos os nutricionistas)
-- Ao editar um template padrão, o nutricionista recebe uma cópia própria.

begin;

-- 1) Permitir nutritionist_id NULL para templates do sistema
alter table public.message_templates
  alter column nutritionist_id drop not null;

-- 2) Política para que qualquer nutricionista autenticado possa VER templates padrão
create policy "message_templates_select_defaults"
  on public.message_templates
  for select
  to authenticated
  using (nutritionist_id is null);

-- 3) Índice único para template_key entre templates padrão (evita duplicatas ao rodar 2x)
create unique index if not exists message_templates_default_template_key_key
  on public.message_templates (template_key)
  where (nutritionist_id is null);

-- 4) Inserir 3 templates padrão (nutritionist_id = null)
insert into public.message_templates (
  nutritionist_id,
  template_key,
  name,
  context,
  channel,
  title_template,
  body_template,
  is_active
) values
  (null, 'default_lembrete_consulta', 'Lembrete de consulta', 'appointment_reminder', 'in_app', 'Lembrete: sua consulta está próxima', 'Olá, {{nome_paciente}}!\n\nEste é um lembrete de que sua consulta de nutrição está agendada. Compareça no horário combinado ou entre em contato para reagendar se necessário.\n\nAté breve!\nData: {{data_hoje}}', true),
  (null, 'default_parabens_meta', 'Parabéns por meta atingida', 'goal_achieved', 'in_app', 'Parabéns! Você atingiu sua meta', 'Olá, {{nome_paciente}}!\n\nParabéns por ter atingido sua meta: {{meta}}.\nSeu progresso foi de {{progresso}} até aqui. Continue assim!\n\nData: {{data_hoje}}', true),
  (null, 'default_lembrete_diario', 'Lembrete para preencher o diário', 'low_adherence', 'in_app', 'Que tal registrar suas refeições?', 'Olá, {{nome_paciente}}!\n\nLembrete amigo: que tal registrar o que você comeu hoje no diário? Isso me ajuda a acompanhar melhor seu progresso e ajustar seu plano quando necessário.\n\nData: {{data_hoje}}', true)
on conflict (template_key) where (nutritionist_id is null) do nothing;

commit;
