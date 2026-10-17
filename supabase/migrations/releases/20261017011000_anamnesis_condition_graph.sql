-- New writes must be executable. Existing templates and clinical snapshots are
-- inspected, never rewritten. Completed history retains its original content.
CREATE OR REPLACE FUNCTION private.anamnesis_graph_error(p_sections jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE section jsonb; field jsonb; fields jsonb:='{}'; parents jsonb:='{}';
 id text; parent text; rule jsonb; cursor_id text; path text[]; done jsonb:='{}'; n integer:=0;
BEGIN
 IF jsonb_typeof(p_sections) IS DISTINCT FROM 'array' THEN RETURN 'invalid_shape'; END IF;
 FOR section IN SELECT value FROM jsonb_array_elements(p_sections) LOOP
  IF jsonb_typeof(section->'fields') IS DISTINCT FROM 'array' THEN RETURN 'invalid_shape'; END IF;
  FOR field IN SELECT value FROM jsonb_array_elements(section->'fields') LOOP
   n:=n+1; IF n>2000 THEN RETURN 'graph_limit'; END IF;
   id:=field->>'id';
   IF jsonb_typeof(field->'id') IS DISTINCT FROM 'string' OR coalesce(btrim(id),'')='' OR fields ? id THEN RETURN 'invalid_identity'; END IF;
   fields:=fields||jsonb_build_object(id,field);
  END LOOP;
 END LOOP;
 FOR id,field IN SELECT key,value FROM jsonb_each(fields) LOOP
  rule:=field->'conditional_logic';
  IF rule IS NULL OR rule='null'::jsonb THEN CONTINUE; END IF;
  parent:=rule->>'field_id';
  IF jsonb_typeof(rule) IS DISTINCT FROM 'object' OR parent IS NULL OR parent=id OR NOT fields ? parent
   OR coalesce(rule->>'operator','') NOT IN ('equals','not_equals','contains','greater_than','less_than') THEN RETURN 'invalid_condition'; END IF;
  parents:=parents||jsonb_build_object(id,parent);
 END LOOP;
 FOR id IN SELECT key FROM jsonb_each(fields) LOOP
  cursor_id:=id;path:='{}';
  WHILE cursor_id IS NOT NULL AND NOT done ? cursor_id LOOP
   IF cursor_id=ANY(path) THEN RETURN 'cycle'; END IF;
   path:=array_append(path,cursor_id);cursor_id:=parents->>cursor_id;
  END LOOP;
  FOREACH cursor_id IN ARRAY path LOOP done:=done||jsonb_build_object(cursor_id,true); END LOOP;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.anamnesis_graph_error(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.anamnesis_graph_error(jsonb) TO postgres;

CREATE OR REPLACE FUNCTION private.guard_anamnesis_graph()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE sections jsonb; failure text;
BEGIN
 IF TG_TABLE_NAME='anamnesis_templates' THEN
  IF TG_OP='UPDATE' AND NEW.sections IS NOT DISTINCT FROM OLD.sections
   AND NOT (NEW.is_active IS TRUE AND OLD.is_active IS DISTINCT FROM TRUE) THEN RETURN NEW; END IF;
  sections:=NEW.sections;
 ELSE
  -- Preserve drafts and immutable completed history; reject new broken snapshots,
  -- issuing a link and finalization. Token revocation without issuance stays safe.
  IF TG_OP='UPDATE' THEN
   IF NEW.template_snapshot IS NOT DISTINCT FROM OLD.template_snapshot
    AND NOT (NEW.status IN ('submitted','validated','completed') AND NEW.status IS DISTINCT FROM OLD.status)
    AND NOT (NEW.public_access_token IS NOT NULL AND NEW.public_access_token IS DISTINCT FROM OLD.public_access_token)
   THEN RETURN NEW; END IF;
  END IF;
  sections:=NEW.template_snapshot->'sections';
  IF sections IS NULL OR sections='null'::jsonb THEN
   SELECT t.sections INTO sections FROM public.anamnesis_templates t WHERE t.id=NEW.template_id;
  END IF;
  -- Older provider fixtures and empty drafts without a selected template keep
  -- their established contract. They cannot introduce a conditional cycle.
  IF sections IS NULL OR sections='null'::jsonb THEN RETURN NEW; END IF;
 END IF;
 failure:=private.anamnesis_graph_error(sections);
 IF failure IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ANAMNESIS_INVALID_CONDITIONS',DETAIL=failure; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_anamnesis_graph() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_anamnesis_template_graph BEFORE INSERT OR UPDATE ON public.anamnesis_templates
 FOR EACH ROW EXECUTE FUNCTION private.guard_anamnesis_graph();
CREATE TRIGGER guard_anamnesis_record_graph BEFORE INSERT OR UPDATE ON public.anamnesis_records
 FOR EACH ROW EXECUTE FUNCTION private.guard_anamnesis_graph();
NOTIFY pgrst,'reload schema';

-- Lock and recheck before rotating the token; completed records cannot be reissued.
CREATE OR REPLACE FUNCTION public.generate_anamnesis_link(p_record_id uuid, p_nutritionist_id uuid, p_expires_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token uuid;
  v_expires_at timestamptz;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null or auth.uid() is distinct from p_nutritionist_id then
    raise exception 'Acesso negado.';
  end if;
  if p_expires_days is null or p_expires_days not between 1 and 30 then
    raise exception 'Prazo inválido.';
  end if;
  perform 1 from public.anamnesis_records
  where id=p_record_id and nutritionist_id=auth.uid() and status in ('draft','pending_patient')
  for update;
  if not found then raise exception using errcode='42501',message='ANAMNESIS_LINK_UNAVAILABLE'; end if;
  v_token := gen_random_uuid();
  v_expires_at := now() + (p_expires_days || ' days')::interval;
  update public.anamnesis_records
  set public_access_token = v_token,
      token_expires_at = v_expires_at,
      status = case when status = 'draft' then 'pending_patient' else status end,
      updated_at = now()
  where id = p_record_id;

  return jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires_at,
    'status', 'pending_patient'
  );
end;
$function$;
