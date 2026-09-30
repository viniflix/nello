create or replace function private.can_access_anamnesis_attachment_object(
  p_name text,p_write boolean default false
) returns boolean language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    p_name ~ '^(public|nutritionist)/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.](jpg|jpeg|png|webp|pdf)$'
    and split_part(p_name,'/',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(p_name,'/',3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.anamnesis_records r
      where r.id=case when split_part(p_name,'/',3) ~ '^[0-9a-f-]{36}$'
        then split_part(p_name,'/',3)::uuid else null end
      and (
        (split_part(p_name,'/',1)='public' and (
          (not p_write and auth.uid()=r.nutritionist_id)
          or (r.public_access_token=split_part(p_name,'/',2)::uuid
            and (r.token_expires_at is null or r.token_expires_at>=now())
            and r.status not in ('submitted','completed','validated'))
        ))
        or (split_part(p_name,'/',1)='nutritionist'
          and auth.uid()=r.nutritionist_id
          and auth.uid()=split_part(p_name,'/',2)::uuid
          and (not p_write or r.status='draft'))
      )
    ),false)
$function$;
