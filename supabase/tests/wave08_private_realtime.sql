-- This suite runs only in a disposable, empty clone and rolls back all data.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('10000000-0000-0000-0000-000000000801','authenticated','authenticated','w8-n1@example.invalid','{"name":"Synthetic N1","user_type":"nutritionist"}'),
('10000000-0000-0000-0000-000000000802','authenticated','authenticated','w8-n2@example.invalid','{"name":"Synthetic N2","user_type":"nutritionist"}'),
('20000000-0000-0000-0000-000000000801','authenticated','authenticated','w8-p1@example.invalid','{"name":"Synthetic P1","user_type":"patient"}'),
('20000000-0000-0000-0000-000000000802','authenticated','authenticated','w8-p2@example.invalid','{"name":"Synthetic P2","user_type":"patient"}');
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000801' where id='20000000-0000-0000-0000-000000000801';
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000000802' where id='20000000-0000-0000-0000-000000000802';
insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values
('10000000-0000-0000-0000-000000000801','20000000-0000-0000-0000-000000000801','active'),
('10000000-0000-0000-0000-000000000802','20000000-0000-0000-0000-000000000802','active');
insert into public.chats(from_id,to_id,message,created_at) select '20000000-0000-0000-0000-000000000801','10000000-0000-0000-0000-000000000801','synthetic '||n,now()-interval '1 hour' from generate_series(1,125)n;
insert into public.notifications(id,user_id,type,content) overriding system value values
(801,'20000000-0000-0000-0000-000000000801','test','{}'),
(802,'20000000-0000-0000-0000-000000000802','test','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000801',true);
do $test$ declare actor uuid:=auth.uid(); peer uuid:='10000000-0000-0000-0000-000000000801'; j jsonb; j2 jsonb; j3 jsonb; sent jsonb; topic text; c integer; begin
 topic:=public.get_realtime_inbox(actor);
 if topic not like 'inbox:%' or position(actor::text in topic)>0 then raise exception 'public_identity_in_topic';end if;
 perform set_config('realtime.topic',topic,true);
 if not private.can_receive_realtime() then raise exception 'own_inbox_denied';end if;
 perform set_config('realtime.topic','inbox:00000000-0000-0000-0000-000000000000',true);
 if private.can_receive_realtime() then raise exception 'foreign_inbox_allowed';end if;
 begin perform public.get_realtime_inbox(peer);raise exception 'old_account_request_allowed';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.get_realtime_inbox(uuid)','execute') or has_function_privilege('authenticated','private.signal_realtime(uuid,text)','execute') or has_table_privilege('authenticated','public.chats','insert') then raise exception 'unsafe_realtime_grant';end if;
 j:=public.update_chat_presence('40000000-0000-0000-0000-000000000801',peer,true,true,actor);
 if jsonb_array_length(j)<>1 or j->0->>'id'<>peer::text then raise exception 'presence_cross_clinic_leak';end if;
 begin perform public.update_chat_presence('40000000-0000-0000-0000-000000000801','10000000-0000-0000-0000-000000000802',true,true,actor);raise exception 'foreign_typing_allowed';exception when insufficient_privilege then null;end;
 begin perform public.update_chat_presence('40000000-0000-0000-0000-000000000801',peer,true,true,peer);raise exception 'account_switched_presence_allowed';exception when insufficient_privilege then null;end;
 sent:=public.send_chat_message(peer,'retry','text',null,'50000000-0000-0000-0000-000000000801',actor);
 if sent->>'from_id'<>actor::text then raise exception 'sender_not_bound';end if;
 j:=public.send_chat_message(peer,'retry','text',null,'50000000-0000-0000-0000-000000000801',actor);
 if sent->>'id'<>j->>'id' then raise exception 'duplicate_retry';end if;
 begin perform public.send_chat_message(peer,'different','text',null,'50000000-0000-0000-0000-000000000801',actor);raise exception 'key_reuse_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.send_chat_message('10000000-0000-0000-0000-000000000802','foreign','text',null,gen_random_uuid(),actor);raise exception 'foreign_recipient_allowed';exception when insufficient_privilege then null;end;
 begin perform public.send_chat_message(peer,'forged account','text',null,gen_random_uuid(),peer);raise exception 'account_switch_send_allowed';exception when insufficient_privilege then null;end;
 j:=public.list_chat_messages(peer,p_actor=>actor);
 if jsonb_array_length(j->'messages')<>50 or not (j->>'has_more')::boolean then raise exception 'first_page_unbounded';end if;
 j2:=public.list_chat_messages(peer,(j->'messages'->49->>'created_at')::timestamptz,(j->'messages'->49->>'id')::bigint,50,actor);
 j3:=public.list_chat_messages(peer,(j2->'messages'->49->>'created_at')::timestamptz,(j2->'messages'->49->>'id')::bigint,50,actor);
 select count(distinct value->>'id') into c from jsonb_array_elements((j->'messages')||(j2->'messages')||(j3->'messages'));
 if c<>126 or jsonb_array_length(j3->'messages')<>26 or (j3->>'has_more')::boolean then raise exception 'cursor_gap_or_duplicate';end if;
 if jsonb_array_length(public.list_chat_messages('10000000-0000-0000-0000-000000000802',p_actor=>actor)->'messages')<>0 then raise exception 'foreign_chat_history';end if;
 begin perform public.list_chat_messages(peer,null,1,50,actor);raise exception 'partial_cursor_allowed';exception when invalid_parameter_value then null;end;
 begin perform public.list_chat_messages(peer,p_limit=>101,p_actor=>actor);raise exception 'unbounded_limit_allowed';exception when invalid_parameter_value then null;end;
 perform public.mark_chat_read(peer,(sent->>'id')::bigint,actor);
 perform public.mark_chat_read(peer,(sent->>'id')::bigint,actor);
 begin perform public.mutate_own_notifications(array[801,802]::bigint[],false,actor);raise exception 'mixed_notification_selection_allowed';exception when insufficient_privilege then null;end;
 if (select is_read from public.notifications where id=801) then raise exception 'partial_notification_mutation';end if;
 perform public.mutate_own_notifications(array[801]::bigint[],true,actor);
 perform public.mutate_own_notifications(array[801]::bigint[],true,actor);
 perform public.mark_all_notifications_read(actor);
end $test$;
reset role;
update public.nutritionist_patients set status='ended' where patient_id='20000000-0000-0000-0000-000000000801';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000801',true);
do $test$ begin
 if public.get_chat_presence(auth.uid())<>'[]'::jsonb then raise exception 'ended_presence_leak';end if;
 begin perform public.send_chat_message('10000000-0000-0000-0000-000000000801','ended','text',null,gen_random_uuid(),auth.uid());raise exception 'ended_send_allowed';exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.list_chat_messages('10000000-0000-0000-0000-000000000801',p_actor=>auth.uid())->'messages')<>50 then raise exception 'historical_chat_removed';end if;
end $test$;
reset role;
rollback;
