begin;

-- ============================================
-- PHASE 17: Notifications Unification
-- ============================================
-- Objetivos:
-- 1) Garantir compatibilidade entre schema antigo (title/message/link_url/read_at)
--    e o frontend atual (is_read/content).
-- 2) Padronizar interação (marcar lida, excluir ao interagir em mensagens).
-- 3) Preparar payload para CTA inteligente por role.

-- 1) Colunas necessárias para o frontend atual
alter table public.notifications
  add column if not exists is_read boolean not null default false,
  add column if not exists content jsonb not null default '{}'::jsonb;

-- Colunas legadas (mantemos para compatibilidade com gatilhos/rotinas antigas)
alter table public.notifications
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists link_url text,
  add column if not exists read_at timestamptz;

-- 2) Backfill de content (apenas quando vazio)
update public.notifications n
set content = jsonb_strip_nulls(
  coalesce(n.content, '{}'::jsonb) ||
  jsonb_build_object(
    'title', n.title,
    'message', n.message,
    'link_url', n.link_url
  )
)
where coalesce(n.content, '{}'::jsonb) = '{}'::jsonb;

-- 3) Backfill de estado de leitura
update public.notifications
set is_read = true
where read_at is not null
  and is_read = false;

-- 4) Trigger para manter is_read/read_at sempre consistentes
create or replace function public.sync_notification_read_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_read is true and new.read_at is null then
    new.read_at := now();
  elsif new.is_read is false then
    new.read_at := null;
  elsif new.read_at is not null then
    new.is_read := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_notification_read_state on public.notifications;
create trigger trg_sync_notification_read_state
before insert or update on public.notifications
for each row execute function public.sync_notification_read_state();

-- 5) Índices para consultas de badge/lista
create index if not exists idx_notifications_user_unread_created
  on public.notifications (user_id, is_read, created_at desc);

create index if not exists idx_notifications_user_type_created
  on public.notifications (user_id, type, created_at desc);

create index if not exists idx_notifications_content_gin
  on public.notifications using gin (content);

-- 6) Função padrão para criar notificação com payload inteligente
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text default 'info',
  p_title text default null,
  p_message text default null,
  p_link_url text default null,
  p_content jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    link_url,
    content,
    is_read
  )
  values (
    p_user_id,
    coalesce(p_type, 'info'),
    p_title,
    p_message,
    p_link_url,
    jsonb_strip_nulls(
      coalesce(p_content, '{}'::jsonb) ||
      jsonb_build_object(
        'title', p_title,
        'message', p_message,
        'link_url', p_link_url
      )
    ),
    false
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 7) Função para interação de notificação:
--    - mensagem: pode excluir direto
--    - demais: marca como lida
create or replace function public.interact_notification(
  p_notification_id uuid,
  p_delete_if_message boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_owner uuid;
begin
  select n.type, n.user_id
    into v_type, v_owner
  from public.notifications n
  where n.id = p_notification_id;

  if v_owner is null then
    return;
  end if;

  if auth.uid() is distinct from v_owner then
    raise exception 'Sem permissão para interagir com esta notificação.';
  end if;

  if p_delete_if_message and v_type = 'new_message' then
    delete from public.notifications
    where id = p_notification_id
      and user_id = auth.uid();
  else
    update public.notifications
    set is_read = true
    where id = p_notification_id
      and user_id = auth.uid();
  end if;
end;
$$;

-- 8) Função para limpar notificações de mensagem por remetente
--    (quando conversa for aberta por qualquer caminho)
create or replace function public.clear_message_notifications_from_sender(
  p_sender_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications n
  where n.user_id = auth.uid()
    and n.type = 'new_message'
    and coalesce(n.content->>'from_id', '') = p_sender_id::text;
end;
$$;

commit;
