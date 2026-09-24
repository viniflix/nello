-- Evaluate the JWT identity once per statement, preserving owner-only access.
alter policy editor_shadow_drafts_owner_select on public.editor_shadow_drafts
  using (owner_id = (select auth.uid()));

alter policy editor_shadow_drafts_owner_insert on public.editor_shadow_drafts
  with check (owner_id = (select auth.uid()));

alter policy editor_shadow_drafts_owner_update on public.editor_shadow_drafts
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy editor_shadow_drafts_owner_delete on public.editor_shadow_drafts
  using (owner_id = (select auth.uid()));
