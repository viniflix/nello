-- Minimal Supabase Storage schema used only by disposable C5 database tests.
-- Columns and grants mirror the linked Storage schema required by C5.

create schema if not exists storage;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  version text,
  owner_id text,
  user_metadata jsonb
);

create unique index bucketid_objname on storage.objects(bucket_id,name);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to anon,authenticated,service_role;
grant all on table storage.buckets,storage.objects to anon,authenticated,service_role;
