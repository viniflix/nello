-- Forward repair: preserve professional submissions, grants and clinical access.
BEGIN;
CREATE OR REPLACE FUNCTION private.require_verification_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF auth.uid() IS NULL OR NOT private.is_admin() OR NOT EXISTS (SELECT 1 FROM private.admin_operators WHERE user_id=auth.uid() AND revoked_at IS NULL AND role IN ('owner','operator')) THEN
  RAISE EXCEPTION USING errcode='42501',message='admin_write_required';
 END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.review_professional_verification(p_verification_id uuid, p_decision text, p_reason text, p_source_url text, p_valid_until timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.professional_verifications%rowtype;
begin
 perform private.wave05_require_active_actor();

  perform private.require_verification_admin();
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception using errcode='22023', message='invalid_review_decision'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception using errcode='22023', message='decision_reason_required'; end if;
  select * into v_row from public.professional_verifications where id=p_verification_id for update;
  if not found then raise exception using errcode='P0002', message='verification_not_found'; end if;
  if v_row.status <> 'pending' then raise exception using errcode='55000', message='invalid_verification_transition'; end if;
  if p_decision='approved' then
    if length(btrim(coalesce(p_source_url,''))) not between 10 and 1000 or btrim(p_source_url) !~ '^https://[^/@[:space:]]+([/?#]|$)' or p_source_url ~ '[[:cntrl:]]' then raise exception using errcode='22023', message='verification_source_required'; end if;
    if p_valid_until is null or not isfinite(p_valid_until) or p_valid_until <= now() then raise exception using errcode='22023', message='future_validity_required'; end if;
    if v_row.professional_role='nutritionist' and p_valid_until > now()+interval '370 days' then raise exception using errcode='22023', message='professional_validity_exceeds_limit'; end if;
    if v_row.professional_role='student' and p_valid_until > now()+interval '190 days' then raise exception using errcode='22023', message='student_validity_exceeds_limit'; end if;
  end if;
  update public.professional_verifications set
    status=p_decision,
    verification_method=case when p_decision='approved' and professional_role='nutritionist' then 'official_registry_manual' when p_decision='approved' then 'student_document_manual' else verification_method end,
    reviewed_by=auth.uid(), reviewed_at=now(), valid_until=case when p_decision='approved' then p_valid_until else null end,
    decision_reason=btrim(p_reason), source_url=nullif(btrim(coalesce(p_source_url,'')),''), source_checked_at=case when p_decision='approved' then now() else null end,
    document_required_reason=null, updated_at=now()
  where id=p_verification_id;
  insert into public.verification_events(verification_id,actor_id,from_status,to_status,reason,source_url,metadata)
  values(p_verification_id,auth.uid(),v_row.status,p_decision,btrim(p_reason),nullif(btrim(coalesce(p_source_url,'')),''),jsonb_build_object('valid_until',p_valid_until));
  return jsonb_build_object('success',true,'status',p_decision);
end;
$function$;

CREATE TRIGGER admin_verification_stamp_revision BEFORE UPDATE ON public.professional_verifications
 FOR EACH ROW EXECUTE FUNCTION private.wave09_stamp_revision();

CREATE OR REPLACE FUNCTION public.admin_verification_queue(p_status text DEFAULT NULL,p_role text DEFAULT NULL,p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE result jsonb;
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF auth.uid() IS NULL OR NOT private.is_admin() OR NOT private.admin_action_allowed('read') THEN
  RAISE EXCEPTION USING errcode='42501',message='admin_mfa_required';
 END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR (p_status IS NOT NULL AND p_status NOT IN ('not_submitted','pending','needs_information','approved','rejected','expired','suspended'))
 OR (p_role IS NOT NULL AND p_role NOT IN ('nutritionist','student')) THEN
  RAISE EXCEPTION USING errcode='22023',message='invalid_verification_filter';
 END IF;
 WITH filtered AS (
  SELECT v.id,v.user_id,p.name,p.email,v.professional_role,
   CASE WHEN v.status='approved' AND v.valid_until<=now() THEN 'expired' ELSE v.status END AS status,
   v.verification_method,v.crn_region,v.crn_number,v.institution_name,v.current_semester,v.expected_graduation_at,
   v.submitted_at,v.reviewed_at,v.valid_until,v.decision_reason,v.source_url,v.document_required_reason,v.updated_at,v.created_at
  FROM public.professional_verifications v JOIN public.user_profiles p ON p.id=v.user_id
  WHERE (p_status IS NULL OR (CASE WHEN v.status='approved' AND v.valid_until<=now() THEN 'expired' ELSE v.status END)=p_status)
   AND (p_role IS NULL OR v.professional_role=p_role)
 ), page_rows AS (SELECT * FROM filtered ORDER BY submitted_at DESC NULLS LAST,created_at DESC,id LIMIT 20 OFFSET (p_page-1)*20)
 SELECT jsonb_build_object('schema_version',1,'generated_at',now(),'source','Banco Nello · verificações profissionais',
  'can_write',private.admin_action_allowed('triage'),'page',p_page,'page_size',20,'total',(SELECT count(*) FROM filtered),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(r)-'created_at' ORDER BY submitted_at DESC NULLS LAST,created_at DESC,id) FROM page_rows r),'[]'::jsonb)) INTO result;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_decide_verification(p_id uuid,p_expected timestamptz,p_nonce uuid,p_decision text,p_reason text,p_source_url text DEFAULT NULL,p_valid_until timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_row public.professional_verifications%rowtype; v_ids text[]; v_hash text; v_result jsonb;
BEGIN
 PERFORM private.require_verification_admin();
 IF auth.uid() IS NULL OR p_id IS NULL OR p_expected IS NULL OR p_nonce IS NULL OR p_decision IS NULL
 OR p_decision NOT IN ('approved','rejected','needs_information','suspended') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
  RAISE EXCEPTION USING errcode='22023',message='invalid_verification_decision';
 END IF;
 v_hash:=md5(jsonb_build_object('id',p_id,'expected',extract(epoch FROM p_expected),'decision',p_decision,'reason',btrim(p_reason),'source',p_source_url,'validity',extract(epoch FROM p_valid_until))::text);
 v_ids:=private.wave09_receipt(p_nonce,'admin:verification',v_hash);
 IF v_ids IS NOT NULL THEN RETURN jsonb_build_object('success',true,'status',v_ids[2],'replayed',true); END IF;
 SELECT * INTO v_row FROM public.professional_verifications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='verification_not_found'; END IF;
 IF v_row.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='verification_changed'; END IF;
 IF p_decision='suspended' THEN v_result:=public.suspend_professional_verification(p_id,btrim(p_reason));
 ELSIF p_decision='needs_information' THEN v_result:=public.request_verification_information(p_id,btrim(p_reason));
 ELSE v_result:=public.review_professional_verification(p_id,p_decision,btrim(p_reason),p_source_url,p_valid_until); END IF;
 PERFORM private.wave09_receipt(p_nonce,'admin:verification',v_hash,ARRAY[p_id::text,p_decision]);
 RETURN v_result||jsonb_build_object('replayed',false);
END $function$;
REVOKE ALL ON FUNCTION public.admin_verification_queue(text,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_decide_verification(uuid,timestamptz,uuid,text,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_verification_queue(text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_verification(uuid,timestamptz,uuid,text,text,text,timestamptz) TO authenticated;
COMMIT;
