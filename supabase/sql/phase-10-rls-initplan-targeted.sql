-- Fase 10: corrigir auth_rls_initplan restante por policy especifica
-- Recria policies listadas, preservando logica original e modo (permissive/restrictive).

begin;

do $$
declare
  r record;
  pol record;
  v_cmd text;
  v_roles text;
  v_roles_list text;
  v_using text;
  v_check text;
  v_mode text;
  v_sql text;
begin
  for r in
    select * from (values
      ('public','foods','Nutritionists can delete their own foods'),
      ('public','foods','Nutritionists can insert foods'),
      ('public','foods','Nutritionists can update their own foods'),
      ('public','anamnese_answers','Nutris podem ver e gerenciar respostas dos seus pacientes'),
      ('public','anamnese_field_options','Nutricionistas podem atualizar opções dos seus campos'),
      ('public','anamnese_field_options','Nutricionistas podem deletar opções dos seus campos'),
      ('public','anamnese_field_options','Nutricionistas podem inserir opções nos seus campos'),
      ('public','anamnese_field_options','Nutricionistas podem ver opções dos seus campos'),
      ('public','anamnese_fields','Nutris podem ver e gerenciar seus próprios campos de anamnese'),
      ('public','anamnesis_records','Nutricionists can create anamnesis for their patients'),
      ('public','anamnesis_records','Nutricionists can delete anamnesis of their patients'),
      ('public','anamnesis_records','Nutricionists can update anamnesis of their patients'),
      ('public','anamnesis_records','Nutricionists can view anamnesis of their patients'),
      ('public','anamnesis_template_fields','Nutricionistas podem deletar associações dos seus templates'),
      ('public','anamnesis_template_fields','Nutricionistas podem inserir associações nos seus templates'),
      ('public','anamnesis_template_fields','Nutricionistas podem ver associações dos seus templates'),
      ('public','anamnesis_templates','Nutricionists can create their own templates'),
      ('public','anamnesis_templates','Nutricionists can delete their own templates'),
      ('public','anamnesis_templates','Nutricionists can update their own templates'),
      ('public','anamnesis_templates','Nutricionists can view their own templates and system defaults'),
      ('public','growth_records','Users can manage growth records for their patients/themselves'),
      ('public','meal_edit_history','Nutritionists can view their patients meal edit history'),
      ('public','prescriptions','Users can see their own prescriptions'),
      ('public','user_achievements','Users can view their own achievements'),
      ('public','weekly_summaries','Users can manage their own summaries'),
      ('public','energy_expenditure_calculations','Nutricionistas podem atualizar cálculos dos seus pacientes'),
      ('public','energy_expenditure_calculations','Nutricionistas podem deletar cálculos dos seus pacientes'),
      ('public','energy_expenditure_calculations','Nutricionistas podem inserir cálculos para seus pacientes'),
      ('public','energy_expenditure_calculations','Nutricionistas podem ver cálculos dos seus pacientes'),
      ('public','patient_goals','Nutritionists can delete patient goals'),
      ('public','patient_goals','Nutritionists can insert patient goals'),
      ('public','patient_goals','Nutritionists can update patient goals'),
      ('public','patient_goals','Read patient_goals'),
      ('public','food_measures','Admins can delete food measures'),
      ('public','food_measures','Admins can insert food measures'),
      ('public','food_measures','Admins can update food measures')
    ) as t(nspname, relname, polname)
  loop
    select polsrc.polname, polsrc.polrelid, polsrc.polcmd, polsrc.polroles, polsrc.polpermissive,
           pg_get_expr(polsrc.polqual, polsrc.polrelid) as using_expr,
           pg_get_expr(polsrc.polwithcheck, polsrc.polrelid) as check_expr
      into pol
    from pg_policy polsrc
    join pg_class c on c.oid = polsrc.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = r.nspname
      and c.relname = r.relname
      and polsrc.polname = r.polname;

    if not found then
      raise notice 'Policy nao encontrada: %.% "%"', r.nspname, r.relname, r.polname;
      continue;
    end if;

    v_cmd :=
      case pol.polcmd
        when 'r' then 'select'
        when 'a' then 'insert'
        when 'w' then 'update'
        when 'd' then 'delete'
        else 'all'
      end;

    select string_agg(quote_ident(rolname), ', ')
      into v_roles
    from pg_roles
    where oid = any(pol.polroles);

    if v_roles is null then
      v_roles_list := 'public';
    else
      v_roles_list := v_roles;
    end if;

    v_using := pol.using_expr;
    v_check := pol.check_expr;
    v_mode := case when pol.polpermissive then 'permissive' else 'restrictive' end;

    if v_using is not null then
      v_using := regexp_replace(v_using, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
      v_using := regexp_replace(v_using, 'auth\\.role\\(\\)', '(select auth.role())', 'g');
      v_using := regexp_replace(v_using, 'current_setting\\(([^\\)]*)\\)', '(select current_setting(\\1))', 'g');
    end if;

    if v_check is not null then
      v_check := regexp_replace(v_check, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
      v_check := regexp_replace(v_check, 'auth\\.role\\(\\)', '(select auth.role())', 'g');
      v_check := regexp_replace(v_check, 'current_setting\\(([^\\)]*)\\)', '(select current_setting(\\1))', 'g');
    end if;

    execute format('drop policy if exists %I on %I.%I', pol.polname, r.nspname, r.relname);

    v_sql := format('create policy %I on %I.%I as %s for %s to %s',
      pol.polname, r.nspname, r.relname, v_mode, v_cmd, v_roles_list);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end $$;

commit;
