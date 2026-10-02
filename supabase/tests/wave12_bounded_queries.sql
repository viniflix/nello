-- Independent volume, tied-order and access checks on a disposable clone only.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('10000000-0000-0000-0000-000000001201','authenticated','authenticated','w12-n1@example.invalid','{"name":"Synthetic N1","user_type":"nutritionist"}'),
('10000000-0000-0000-0000-000000001202','authenticated','authenticated','w12-n2@example.invalid','{"name":"Synthetic N2","user_type":"nutritionist"}');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select md5('w12-p-'||n)::uuid,'authenticated','authenticated','w12-p-'||n||'@example.invalid',jsonb_build_object('name','Synthetic patient '||n,'user_type','patient') from generate_series(1,1001) n;
update public.user_profiles set nutritionist_id='10000000-0000-0000-0000-000000001201' where email like 'w12-p-%@example.invalid';
insert into public.nutritionist_patients(nutritionist_id,patient_id,status)
select '10000000-0000-0000-0000-000000001201',md5('w12-p-'||n)::uuid,'active' from generate_series(1,1001) n;
update public.care_episodes set started_at='2026-10-01T00:00:00Z' where nutritionist_id='10000000-0000-0000-0000-000000001201';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000001201',true);
do $test$
declare ids text[];expected text[];paged text[];body text;
begin
 select array_agg(row->>'id') into ids from public.list_nutritionist_care_patients() row;
 select array_agg(md5('w12-p-'||n)::uuid::text order by md5('w12-p-'||n)::uuid desc) into expected from generate_series(1,1001) n;
 if ids is distinct from expected then raise exception 'unstable_ties_or_missing_records';end if;
 select array_agg(id order by page,position) into paged from (
  select page,row->>'id' id,row_number() over() position from generate_series(0,4) page
  cross join lateral (select row from public.list_nutritionist_care_patients() row limit 250 offset page*250) rows
 ) pages;
 if cardinality(paged)<>1001 or (select count(distinct id) from unnest(paged) id)<>1001 then raise exception 'pagination_gap_or_duplicate';end if;
 if has_function_privilege('anon','public.list_nutritionist_care_patients()','execute') then raise exception 'anonymous_access_regression';end if;
 body:=pg_get_functiondef('public.list_nutritionist_care_patients()'::regprocedure);
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='notifications_user_created_id_idx'
  and indexdef like '%(user_id, created_at DESC, id DESC)%') then raise exception 'notification_keyset_index_missing';end if;
 if position('private.wave05_active_actor()' in body)=0 or position('ce.nutritionist_id = c.id' in body)=0 then raise exception 'actor_boundary_lost';end if;
end;$test$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000001202',true);
do $test$ begin if exists(select 1 from public.list_nutritionist_care_patients()) then raise exception 'cross_owner_list_leak';end if;end;$test$;
rollback;
