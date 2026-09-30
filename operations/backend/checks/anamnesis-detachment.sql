-- Runs only inside the isolated reconstruction clone. No production data.
begin;
select set_config('qa.expect_fixed', :'expect_fixed', true);
create temporary table detach_cases(label text,actor_role text,actor uuid,state text,
  stored_token uuid,supplied_token uuid,expires timestamptz,allowed boolean,baseline_allowed boolean);
insert into detach_cases values
('anon missing token draft','anon',null,'draft','80000000-0000-0000-0000-000000000021',null,'2099-01-01',false,true),
('anon wrong token draft','anon',null,'draft','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000022','2099-01-01',false,true),
('anon expired draft','anon',null,'draft','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021','2020-01-01',false,true),
('anon stored null token','anon',null,'in_progress',null,'80000000-0000-0000-0000-000000000022','2099-01-01',false,true),
('other stored null token','authenticated','10000000-0000-0000-0000-000000000085','in_progress',null,'80000000-0000-0000-0000-000000000022','2099-01-01',false,true),
('other missing token','authenticated','10000000-0000-0000-0000-000000000085','draft','80000000-0000-0000-0000-000000000021',null,'2099-01-01',false,false),
('owner non-draft','authenticated','10000000-0000-0000-0000-000000000081','in_progress','80000000-0000-0000-0000-000000000021',null,'2099-01-01',false,false),
('closed submitted','anon',null,'submitted','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021','2099-01-01',false,false),
('closed validated','anon',null,'validated','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021','2099-01-01',false,false),
('expired non-draft','anon',null,'in_progress','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021','2020-01-01',false,false),
('owner draft','authenticated','10000000-0000-0000-0000-000000000081','draft','80000000-0000-0000-0000-000000000021',null,'2099-01-01',true,true),
('valid public draft','anon',null,'draft','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021','2099-01-01',true,true),
('valid public in progress','anon',null,'in_progress','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021','2099-01-01',true,true),
('valid public pending','anon',null,'pending_patient','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021','2099-01-01',true,true),
('valid public no expiry','anon',null,'in_progress','80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000021',null,true,true);

do $contract$
declare
  scenario record;
  permitted boolean;
  expected boolean;
  response jsonb;
  before_attachments jsonb;
  before_updated timestamptz;
  after_attachments jsonb;
  after_updated timestamptz;
  executed integer := 0;
begin
  for scenario in select * from pg_temp.detach_cases order by label loop
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    delete from public.anamnesis_records where id='80000000-0000-0000-0000-000000000001';
    insert into public.anamnesis_records(id,patient_id,nutritionist_id,care_episode_id,
      content,status,public_access_token,token_expires_at,filled_by,attachments)
    values('80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000081',
      '10000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000081','{}',
      scenario.state,scenario.stored_token,scenario.expires,'patient',
      '[{"id":"80000000-0000-0000-0000-000000000011","storage_path":"qa/synthetic.pdf"},
        {"id":"80000000-0000-0000-0000-000000000012","storage_path":"qa/other.pdf"}]');
    select attachments,updated_at into before_attachments,before_updated
      from public.anamnesis_records where id='80000000-0000-0000-0000-000000000001';
    perform set_config('request.jwt.claim.sub',coalesce(scenario.actor::text,''),true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',scenario.actor,'role',scenario.actor_role)::text,true);
    permitted := true;
    begin
      execute format('set local role %I',scenario.actor_role);
      response := public.detach_anamnesis_file('80000000-0000-0000-0000-000000000001',
        scenario.supplied_token,'80000000-0000-0000-0000-000000000011');
    exception when insufficient_privilege then
      if sqlerrm <> 'ANAMNESIS_FILE_ACCESS_DENIED' then raise; end if;
      permitted := false;
    end;
    reset role;
    expected := case when current_setting('qa.expect_fixed')='1' then scenario.allowed else scenario.baseline_allowed end;
    if permitted is distinct from expected then
      raise exception 'detachment_contract:%:expected_%:actual_%',scenario.label,expected,permitted;
    end if;
    select attachments,updated_at into after_attachments,after_updated
      from public.anamnesis_records where id='80000000-0000-0000-0000-000000000001';
    if not permitted and (after_attachments is distinct from before_attachments or after_updated is distinct from before_updated) then
      raise exception 'detachment_denial_mutated_record:%',scenario.label;
    end if;
    if permitted and (jsonb_array_length(after_attachments)<>1 or response->'attachments' is distinct from after_attachments
      or response->>'storage_path' <> 'qa/synthetic.pdf') then
      raise exception 'detachment_success_contract:%',scenario.label;
    end if;
    executed := executed + 1;
    raise notice 'PASS detachment scenario %',scenario.label;
  end loop;
  if executed<>15 then raise exception 'detachment_contract_incomplete:%',executed; end if;
end $contract$;
rollback;
