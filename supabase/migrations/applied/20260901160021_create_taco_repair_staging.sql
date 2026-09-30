create unlogged table public._taco_repair_staging (source_id text primary key, db_id uuid not null, db_name text not null, remote_status integer not null, payload jsonb not null);
