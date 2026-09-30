-- C6.3: controlled, versioned document layouts and canonical composition.

create table public.document_layouts (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  name text not null,
  description text,
  active_version integer not null default 1 check (active_version > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_layout_versions (
  layout_code text not null references public.document_layouts(code) on delete restrict,
  version integer not null check (version > 0),
  payload_schema_version integer not null default 1 check (payload_schema_version > 0),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  tokens jsonb not null check (jsonb_typeof(tokens) = 'object'),
  allowed_source_types text[] not null default '{}'::text[],
  nello_attribution text not null default 'Gerado com Nello'
    check (nello_attribution = 'Gerado com Nello'),
  created_at timestamptz not null default now(),
  primary key(layout_code, version)
);

alter table public.document_layouts
  add constraint document_layouts_active_version_fk
  foreign key(code, active_version)
  references public.document_layout_versions(layout_code, version)
  deferrable initially deferred;

create or replace function private.reject_document_layout_version_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'document_layout_versions_are_immutable';
end;
$$;
revoke all on function private.reject_document_layout_version_mutation() from public,anon,authenticated;
create trigger trg_document_layout_versions_immutable
before update or delete on public.document_layout_versions
for each row execute function private.reject_document_layout_version_mutation();

alter table public.document_layouts enable row level security;
alter table public.document_layout_versions enable row level security;
revoke all on table public.document_layouts,public.document_layout_versions from public,anon,authenticated;
grant select on table public.document_layouts,public.document_layout_versions to authenticated,service_role;
grant insert,update on table public.document_layouts to service_role;
grant insert on table public.document_layout_versions to service_role;
create policy document_layouts_active_read on public.document_layouts for select to authenticated
using (is_active);
create policy document_layout_versions_active_read on public.document_layout_versions for select to authenticated
using (exists(select 1 from public.document_layouts l where l.code=layout_code and l.is_active));

insert into public.document_layouts(code,name,description) values
('clinical_record','Registro clínico','Documento derivado de registro clínico finalizado ou assinado.'),
('meal_plan','Plano alimentar','Plano alimentar profissional.'),
('prescription','Prescrição','Prescrição e orientação nutricional.'),
('orientation','Orientação','Orientações profissionais ao paciente.'),
('clinical_report','Relatório clínico','Relatório nutricional profissional.'),
('data_export','Portabilidade de dados','Documento de portabilidade solicitado pelo titular.');

insert into public.document_layout_versions(
  layout_code,version,payload_schema_version,blocks,tokens,allowed_source_types
)
select code,1,1,
  '["professional_brand","patient_identity","document_title","structured_content","signature","authenticity","nello_attribution"]'::jsonb,
  '{"page":"A4","font_family":"Nello Sans","margin_mm":16,"nello_brand_locked":true,"arbitrary_html":false,"arbitrary_css":false}'::jsonb,
  case code
    when 'clinical_record' then array['clinical_record']::text[]
    when 'meal_plan' then array['meal_plan']::text[]
    when 'prescription' then array['prescription']::text[]
    when 'data_export' then array['data_export']::text[]
    else array['manual']::text[] end
from public.document_layouts;

create or replace function private.compose_document_payload(
  p_layout_code text,
  p_layout_version integer,
  p_identity_id uuid,
  p_patient jsonb,
  p_content jsonb,
  p_metadata jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_layout public.document_layout_versions%rowtype;
  v_identity public.professional_document_identities%rowtype;
begin
  if jsonb_typeof(coalesce(p_patient,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_content,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
    raise exception using errcode='22023',message='document_composition_objects_required';
  end if;
  select * into v_layout from public.document_layout_versions
  where layout_code=p_layout_code and version=p_layout_version;
  if not found then raise exception using errcode='P0002',message='document_layout_version_not_found'; end if;
  select * into v_identity from public.professional_document_identities where id=p_identity_id;
  if not found then raise exception using errcode='P0002',message='document_identity_not_found'; end if;

  return jsonb_build_object(
    'schema_version',v_layout.payload_schema_version,
    'layout',jsonb_build_object(
      'code',v_layout.layout_code,'version',v_layout.version,
      'blocks',v_layout.blocks,'tokens',v_layout.tokens
    ),
    'branding',jsonb_build_object(
      'product','Nello','attribution',v_layout.nello_attribution,'removable',false
    ),
    'professional',jsonb_strip_nulls(jsonb_build_object(
      'identity_id',v_identity.id,'identity_version',v_identity.version,
      'name',v_identity.professional_name,'clinic_name',v_identity.clinic_name,
      'email',v_identity.professional_email,'phone',v_identity.professional_phone,
      'address_line',v_identity.address_line,'address_city',v_identity.address_city,
      'address_state',v_identity.address_state,'address_postal_code',v_identity.address_postal_code,
      'crn_region',v_identity.crn_region,'crn_number',v_identity.crn_number,
      'normalized_crn',v_identity.normalized_crn,
      'primary_color',v_identity.primary_color,'accent_color',v_identity.accent_color,
      'header_text',v_identity.header_text,'footer_text',v_identity.footer_text,
      'logo_storage_path',v_identity.logo_storage_path,
      'signature_storage_path',v_identity.signature_storage_path,
      'stamp_storage_path',v_identity.stamp_storage_path
    )),
    'patient',coalesce(p_patient,'{}'::jsonb),
    'content',coalesce(p_content,'{}'::jsonb),
    'metadata',coalesce(p_metadata,'{}'::jsonb)
  );
end;
$$;
revoke all on function private.compose_document_payload(text,integer,uuid,jsonb,jsonb,jsonb)
from public,anon,authenticated;
