begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000601','authenticated','authenticated','wave6@example.invalid','{"name":"QA edge","user_type":"nutritionist"}');
do $test$ declare n integer;begin
 if has_function_privilege('anon','public.consume_edge_operation_quota(uuid,text)','EXECUTE')
 or has_function_privilege('authenticated','public.consume_edge_operation_quota(uuid,text)','EXECUTE') then raise exception 'quota_client_callable';end if;
 if has_table_privilege('authenticated','private.edge_operation_quotas','SELECT') then raise exception 'quota_client_readable';end if;
 for n in 1..11 loop
  if public.consume_edge_operation_quota('10000000-0000-4000-8000-000000000601','pdf') <> (n<=10) then raise exception 'quota_limit';end if;
 end loop;
 if not public.consume_edge_operation_quota('10000000-0000-4000-8000-000000000601','document') then raise exception 'quota_operation_isolation';end if;
 update private.edge_operation_quotas set window_start=now()-interval '2 minutes' where operation='pdf';
 if not public.consume_edge_operation_quota('10000000-0000-4000-8000-000000000601','pdf') then raise exception 'quota_reset';end if;
 update public.user_profiles set is_active=false where id='10000000-0000-4000-8000-000000000601';
 if public.consume_edge_operation_quota('10000000-0000-4000-8000-000000000601','pdf') then raise exception 'inactive_actor';end if;
end;$test$;
rollback;
