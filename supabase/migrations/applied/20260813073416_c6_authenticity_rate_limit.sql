-- C6.8: privacy-preserving abuse control for the anonymous authenticity lookup.
create table private.document_authenticity_rate_limits (
  fingerprint_hash text not null,
  bucket_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (fingerprint_hash, bucket_started_at)
);

revoke all on table private.document_authenticity_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.document_authenticity_rate_limits to service_role;

create or replace function private.document_authenticity_fingerprint()
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_headers jsonb;
  v_source text;
begin
  begin
    v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then
    v_headers:='{}'::jsonb;
  end;
  v_source:=concat_ws('|',
    coalesce(v_headers->>'cf-connecting-ip',v_headers->>'x-real-ip',split_part(coalesce(v_headers->>'x-forwarded-for','unknown'),',',1)),
    left(coalesce(v_headers->>'user-agent','unknown'),300)
  );
  return encode(extensions.digest(convert_to(v_source,'UTF8'),'sha256'),'hex');
end
$$;

revoke all on function private.document_authenticity_fingerprint() from public,anon,authenticated;

create or replace function public.verify_document_authenticity(p_code uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_fingerprint text:=private.document_authenticity_fingerprint();
  v_bucket timestamptz:=date_trunc('minute',clock_timestamp());
  v_count integer;
  v_result jsonb;
begin
  insert into private.document_authenticity_rate_limits(fingerprint_hash,bucket_started_at,request_count)
  values(v_fingerprint,v_bucket,1)
  on conflict(fingerprint_hash,bucket_started_at)
  do update set request_count=private.document_authenticity_rate_limits.request_count+1
  returning request_count into v_count;

  if v_count>30 then
    return jsonb_build_object('found',false,'rate_limited',true,'retry_after_seconds',60);
  end if;

  select jsonb_build_object(
    'found',true,'document_type',a.layout_code,'status',a.status,'signed_at',a.signed_at,
    'professional',jsonb_build_object('name',i.professional_name,'crn_region',i.crn_region,'crn_number',i.crn_number),
    'integrity',jsonb_build_object('sha256',a.canonical_sha256),'issuer','Nello'
  ) into v_result
  from public.document_artifacts a
  join public.professional_document_identities i on i.id=a.identity_id
  where a.authenticity_code=p_code and a.status in('signed','invalidated','superseded');

  return coalesce(v_result,jsonb_build_object('found',false));
end
$$;

revoke all on function public.verify_document_authenticity(uuid) from public,anon,authenticated;
grant execute on function public.verify_document_authenticity(uuid) to public,anon,authenticated,service_role;

-- Retention is maintained by the project scheduler/service role with:
-- delete from private.document_authenticity_rate_limits
-- where bucket_started_at < now() - interval '1 day';
