-- Módulo: Fotos de Progresso (antes/depois)
create table if not exists public.progress_photos (
    id              uuid primary key default gen_random_uuid(),
    patient_id      uuid not null references public.user_profiles(id) on delete cascade,
    photo_url       text not null,
    photo_date      date not null,
    uploaded_by     uuid references public.user_profiles(id) on delete set null,
    notes           text,
    created_at      timestamptz not null default now()
);
create index if not exists progress_photos_patient_date_idx on public.progress_photos (patient_id, photo_date desc);
create index if not exists progress_photos_patient_created_idx on public.progress_photos (patient_id, created_at desc);
alter table public.progress_photos enable row level security;
create policy "progress_photos_select" on public.progress_photos for select to authenticated using (patient_id = auth.uid() or exists (select 1 from public.user_profiles p where p.id = progress_photos.patient_id and p.nutritionist_id = auth.uid()));
create policy "progress_photos_insert" on public.progress_photos for insert to authenticated with check (patient_id = auth.uid() or exists (select 1 from public.user_profiles p where p.id = progress_photos.patient_id and p.nutritionist_id = auth.uid()));
create policy "progress_photos_update" on public.progress_photos for update to authenticated using (patient_id = auth.uid() or exists (select 1 from public.user_profiles p where p.id = progress_photos.patient_id and p.nutritionist_id = auth.uid()));
create policy "progress_photos_delete" on public.progress_photos for delete to authenticated using (patient_id = auth.uid() or exists (select 1 from public.user_profiles p where p.id = progress_photos.patient_id and p.nutritionist_id = auth.uid()));
