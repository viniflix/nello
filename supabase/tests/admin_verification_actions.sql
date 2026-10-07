begin;
-- Independent, rollback-only personas. No production account is used.
do $$ declare op uuid:=gen_random_uuid(); auditor uuid:=gen_random_uuid(); person uuid:=gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 select id,'authenticated','authenticated',id||'@example.invalid',now(),'{"name":"Synthetic verification","user_type":"nutritionist"}'::jsonb from unnest(array[op,auditor,person]) id;
 insert into private.admin_operators(user_id,role,grant_reason) values(op,'owner','Synthetic verification matrix'),(auditor,'auditor','Synthetic read only matrix');
 update public.professional_verifications set status='pending',submitted_at=now() where user_id=person;
 perform set_config('qa.verification_op',op::text,true); perform set_config('qa.verification_auditor',auditor::text,true);
 perform set_config('qa.verification_id',(select id::text from public.professional_verifications where user_id=person),true);
 if has_function_privilege('anon','public.admin_verification_queue(text,text,integer)','execute') or has_function_privilege('anon','public.admin_decide_verification(uuid,timestamptz,uuid,text,text,text,timestamptz)','execute') then raise exception 'anonymous_admin_grant';end if;
end $$;
set local role authenticated;
do $$ declare op uuid:=current_setting('qa.verification_op')::uuid; auditor uuid:=current_setting('qa.verification_auditor')::uuid; v_id uuid:=current_setting('qa.verification_id')::uuid; row_data jsonb; revision timestamptz; nonce uuid:=gen_random_uuid(); approval timestamptz:=now()+interval '30 days'; queue jsonb; result jsonb; count_before bigint;
begin
 perform set_config('request.jwt.claim.sub',auditor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auditor,'role','authenticated','aal','aal2')::text,true);
 queue:=public.admin_verification_queue();
 if queue->>'can_write'<>'false' or jsonb_array_length(queue->'items')>20 then raise exception 'auditor_queue_contract';end if;
 select value into row_data from jsonb_array_elements(queue->'items') where value->>'id'=v_id::text;
 if row_data is null or row_data->>'updated_at' is null then raise exception 'queue_revision_missing';end if;
 revision:=(row_data->>'updated_at')::timestamptz;
 begin perform public.review_professional_verification(v_id,'approved','Synthetic approval','https://cfn.org.br/',approval);raise exception 'auditor_approved';exception when insufficient_privilege then null;end;
 begin perform public.request_verification_information(v_id,'Synthetic supplement');raise exception 'auditor_requested';exception when insufficient_privilege then null;end;
 begin perform public.suspend_professional_verification(v_id,'Synthetic suspension');raise exception 'auditor_suspended';exception when insufficient_privilege then null;end;
 begin perform public.admin_decide_verification(v_id,revision,nonce,'approved','Synthetic approval','https://cfn.org.br/',approval);raise exception 'auditor_decided';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',op::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal1')::text,true);
 begin perform public.admin_verification_queue();raise exception 'aal1_read';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'role','authenticated','aal','aal2')::text,true);
 begin perform public.admin_verification_queue(null,null,null);raise exception 'null_page_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.admin_verification_queue('invented');raise exception 'invalid_filter_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.review_professional_verification(v_id,'approved','Synthetic approval','https://cfn.org.br/',null);raise exception 'null_validity_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.review_professional_verification(v_id,null,'Synthetic approval',null,null);raise exception 'null_decision_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.review_professional_verification(v_id,'approved','Synthetic approval','https://secret@example.invalid/',approval);raise exception 'credential_source_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.admin_decide_verification(v_id,revision-interval '1 second',nonce,'approved','Synthetic approval','https://cfn.org.br/',approval);raise exception 'stale_revision_allowed';exception when sqlstate 'PT409' then null;end;
 select count(*) into count_before from public.verification_events where verification_id=v_id;
 result:=public.admin_decide_verification(v_id,revision,nonce,'approved','Synthetic approval','https://cfn.org.br/',approval);
 if result->>'success'<>'true' or result->>'replayed'<>'false' then raise exception 'approval_not_confirmed';end if;
 result:=public.admin_decide_verification(v_id,revision,nonce,'approved','Synthetic approval','https://cfn.org.br/',approval);
 if result->>'replayed'<>'true' or (select count(*) from public.verification_events where verification_id=v_id)<>count_before+1 then raise exception 'duplicate_decision';end if;
 begin perform public.admin_decide_verification(v_id,revision,nonce,'rejected','Synthetic changed request');raise exception 'nonce_reuse_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.admin_decide_verification(v_id,revision,gen_random_uuid(),'suspended','Synthetic suspension');raise exception 'old_revision_allowed';exception when sqlstate 'PT409' then null;end;
 perform set_config('qa.approval_revision',(select updated_at::text from public.professional_verifications where id=v_id),true);
 if current_setting('qa.approval_revision')::timestamptz=revision then raise exception 'revision_did_not_advance';end if;
 perform public.admin_decide_verification(v_id,current_setting('qa.approval_revision')::timestamptz,gen_random_uuid(),'suspended','Synthetic suspension');
end $$;
reset role;
update private.admin_operators set revoked_at=now() where user_id=current_setting('qa.verification_op')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.admin_verification_queue();raise exception 'revoked_read';exception when insufficient_privilege then null;end;
 begin perform public.admin_decide_verification(current_setting('qa.verification_id')::uuid,current_setting('qa.approval_revision')::timestamptz,gen_random_uuid(),'suspended','Synthetic suspension');raise exception 'revoked_write';exception when insufficient_privilege then null;end;
end $$;
rollback;
