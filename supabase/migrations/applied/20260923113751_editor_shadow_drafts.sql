-- Autosave working copies are never patient-visible clinical records.
create table if not exists public.editor_shadow_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint editor_shadow_drafts_key_length check (char_length(draft_key) between 1 and 240),
  constraint editor_shadow_drafts_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint editor_shadow_drafts_owner_key_unique unique (owner_id, draft_key)
);

create index if not exists editor_shadow_drafts_updated_idx
  on public.editor_shadow_drafts (owner_id, updated_at desc);

alter table public.editor_shadow_drafts enable row level security;

create policy editor_shadow_drafts_owner_select on public.editor_shadow_drafts
  for select to authenticated using (owner_id = auth.uid());
create policy editor_shadow_drafts_owner_insert on public.editor_shadow_drafts
  for insert to authenticated with check (owner_id = auth.uid());
create policy editor_shadow_drafts_owner_update on public.editor_shadow_drafts
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy editor_shadow_drafts_owner_delete on public.editor_shadow_drafts
  for delete to authenticated using (owner_id = auth.uid());

revoke all on public.editor_shadow_drafts from anon;
grant select, insert, update, delete on public.editor_shadow_drafts to authenticated;
