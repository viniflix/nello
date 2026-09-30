-- CI-only complete live policy baseline. This is NOT a production hardening migration.

-- All 244 definitions are captured production metadata; historical/manual drift is retained explicitly.

DO $baseline$ DECLARE p record; BEGIN
  FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies
    WHERE schemaname IN ('public','private','storage') LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
  END LOOP;
END $baseline$;

CREATE POLICY "Public can view all achievements definitions" ON "public"."achievements" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Nutritionists can insert activity_log for their patients" ON "public"."activity_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((patient_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.nutritionist_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Nutritionists can read activity_log for their patients" ON "public"."activity_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((patient_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.nutritionist_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Nutricionists can create anamnesis for their patients" ON "public"."anamnesis_records" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((auth_uid() = nutritionist_id) AND (patient_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.nutritionist_id = auth_uid())))));

CREATE POLICY "Nutricionists can delete anamnesis of their patients" ON "public"."anamnesis_records" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((auth_uid() = nutritionist_id) OR (patient_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.nutritionist_id = auth_uid())))));

CREATE POLICY "Nutricionists can update anamnesis of their patients" ON "public"."anamnesis_records" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((auth_uid() = nutritionist_id) OR (patient_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.nutritionist_id = auth_uid())))) AND (status <> 'awaiting_patient'::text))) WITH CHECK (((auth_uid() = nutritionist_id) OR (patient_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.nutritionist_id = auth_uid())))));

CREATE POLICY "Nutricionists can view anamnesis of their patients" ON "public"."anamnesis_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth_uid() = nutritionist_id) OR (patient_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.nutritionist_id = auth_uid()))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = anamnesis_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."anamnesis_records" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = anamnesis_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = anamnesis_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "anamnesis_templates_delete" ON "public"."anamnesis_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND (is_system_default IS FALSE)));

CREATE POLICY "anamnesis_templates_insert" ON "public"."anamnesis_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND (is_system_default IS FALSE)));

CREATE POLICY "anamnesis_templates_select" ON "public"."anamnesis_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (is_system_default IS TRUE)));

CREATE POLICY "anamnesis_templates_update" ON "public"."anamnesis_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND (is_system_default IS FALSE))) WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND (is_system_default IS FALSE)));

CREATE POLICY "appointments_delete" ON "public"."appointments" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND ((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM nutritionist_patients np
  WHERE ((np.patient_id = appointments.patient_id) AND (np.nutritionist_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = appointments.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "appointments_insert" ON "public"."appointments" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND ((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM nutritionist_patients np
  WHERE ((np.patient_id = appointments.patient_id) AND (np.nutritionist_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = appointments.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "appointments_select" ON "public"."appointments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((((nutritionist_id = ( SELECT auth.uid() AS uid)) AND ((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM nutritionist_patients np
  WHERE ((np.patient_id = appointments.patient_id) AND (np.nutritionist_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = appointments.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))))) OR (patient_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = appointments.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "appointments_update" ON "public"."appointments" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND ((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM nutritionist_patients np
  WHERE ((np.patient_id = appointments.patient_id) AND (np.nutritionist_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = appointments.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND ((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM nutritionist_patients np
  WHERE ((np.patient_id = appointments.patient_id) AND (np.nutritionist_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = appointments.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."appointments" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = appointments.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = appointments.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Nutri criar arquivados" ON "public"."archived_patient_links" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Nutri deletar arquivados" ON "public"."archived_patient_links" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Nutri ver arquivados" ON "public"."archived_patient_links" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Admins can delete bug reports" ON "public"."bug_reports" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.is_admin = true)))));

CREATE POLICY "Admins can update bug reports" ON "public"."bug_reports" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.is_admin = true)))));

CREATE POLICY "Admins can view all bug reports" ON "public"."bug_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.is_admin = true)))));

CREATE POLICY "Users can insert bug reports" ON "public"."bug_reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "care_episodes_select_participant" ON "public"."care_episodes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) OR (nutritionist_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Chat participants can insert" ON "public"."chats" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((from_id = ( SELECT auth_uid() AS uid)) OR (to_id = ( SELECT auth_uid() AS uid))));

CREATE POLICY "Chat participants can read" ON "public"."chats" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((from_id = ( SELECT auth_uid() AS uid)) OR (to_id = ( SELECT auth_uid() AS uid))));

CREATE POLICY "Delete fields" ON "public"."checkin_fields" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((template_id IN ( SELECT checkin_templates.id
   FROM checkin_templates
  WHERE (checkin_templates.nutritionist_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Escrita fields" ON "public"."checkin_fields" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((template_id IN ( SELECT checkin_templates.id
   FROM checkin_templates
  WHERE (checkin_templates.nutritionist_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Leitura fields" ON "public"."checkin_fields" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((template_id IN ( SELECT checkin_templates.id
   FROM checkin_templates
  WHERE (checkin_templates.nutritionist_id = ( SELECT auth.uid() AS uid)))) OR (template_id IN ( SELECT checkin_schedules.template_id
   FROM checkin_schedules
  WHERE (checkin_schedules.patient_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Update fields" ON "public"."checkin_fields" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((template_id IN ( SELECT checkin_templates.id
   FROM checkin_templates
  WHERE (checkin_templates.nutritionist_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Delete schedules" ON "public"."checkin_schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Escrita schedules" ON "public"."checkin_schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Leitura schedules" ON "public"."checkin_schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = checkin_schedules.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Update schedules" ON "public"."checkin_schedules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "b2_episode_isolation" ON "public"."checkin_schedules" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = checkin_schedules.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = checkin_schedules.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "checkin_schedules_owner_insert" ON "public"."checkin_schedules" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM checkin_templates t
  WHERE ((t.id = checkin_schedules.template_id) AND (t.nutritionist_id = ( SELECT auth.uid() AS uid)) AND (t.is_active IS TRUE))))));

CREATE POLICY "checkin_schedules_owner_update" ON "public"."checkin_schedules" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM checkin_templates t
  WHERE ((t.id = checkin_schedules.template_id) AND (t.nutritionist_id = ( SELECT auth.uid() AS uid)) AND (t.is_active IS TRUE))))));

CREATE POLICY "Acesso a sessoes" ON "public"."checkin_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = checkin_sessions.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."checkin_sessions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = checkin_sessions.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = checkin_sessions.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "checkin_sessions_no_direct_delete" ON "public"."checkin_sessions" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);

CREATE POLICY "checkin_sessions_no_direct_insert" ON "public"."checkin_sessions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);

CREATE POLICY "checkin_sessions_patient_completion" ON "public"."checkin_sessions" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (expires_at > now()))) WITH CHECK (((patient_id = ( SELECT auth.uid() AS uid)) AND (status = 'completed'::text)));

CREATE POLICY "s02_checkin_sessions_delete" ON "public"."checkin_sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "s02_checkin_sessions_insert" ON "public"."checkin_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "s02_checkin_sessions_update" ON "public"."checkin_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Delete templates" ON "public"."checkin_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Escrita templates" ON "public"."checkin_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Leitura templates" ON "public"."checkin_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT checkin_schedules.template_id
   FROM checkin_schedules
  WHERE (checkin_schedules.patient_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Update templates" ON "public"."checkin_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "evolution_template_events_owner_select" ON "public"."clinical_evolution_template_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM clinical_evolution_templates t
  WHERE ((t.code = clinical_evolution_template_events.template_code) AND (t.owner_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "evolution_template_versions_authenticated_select" ON "public"."clinical_evolution_template_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM clinical_evolution_templates t
  WHERE ((t.code = clinical_evolution_template_versions.template_code) AND (((t.category = 'system'::text) AND t.is_active) OR ((t.category = 'private'::text) AND (t.owner_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "evolution_templates_authenticated_select" ON "public"."clinical_evolution_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((((category = 'system'::text) AND is_active) OR ((category = 'private'::text) AND (owner_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "clinical_record_events_participant_select" ON "public"."clinical_record_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.can_read_clinical_record(clinical_record_id));

CREATE POLICY "clinical_record_types_authenticated_select" ON "public"."clinical_record_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_active);

CREATE POLICY "clinical_records_participant_select" ON "public"."clinical_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.can_read_clinical_record(id));

CREATE POLICY "communication_automations_delete_own" ON "public"."communication_automations" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "communication_automations_insert_own" ON "public"."communication_automations" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "communication_automations_select_own" ON "public"."communication_automations" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "communication_automations_update_own" ON "public"."communication_automations" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Users can manage their own template substitutions" ON "public"."diet_template_food_substitutions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((diet_template_foods dtf
     JOIN diet_template_meals dtm ON ((dtm.id = dtf.meal_id)))
     JOIN diet_templates dt ON ((dt.id = dtm.template_id)))
  WHERE ((dtf.id = diet_template_food_substitutions.template_food_id) AND (dt.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((diet_template_foods dtf
     JOIN diet_template_meals dtm ON ((dtm.id = dtf.meal_id)))
     JOIN diet_templates dt ON ((dt.id = dtm.template_id)))
  WHERE ((dtf.id = diet_template_food_substitutions.template_food_id) AND (dt.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Users can manage their own template foods" ON "public"."diet_template_foods" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (diet_template_meals dtm
     JOIN diet_templates dt ON ((dt.id = dtm.template_id)))
  WHERE ((dtm.id = diet_template_foods.meal_id) AND (dt.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (diet_template_meals dtm
     JOIN diet_templates dt ON ((dt.id = dtm.template_id)))
  WHERE ((dtm.id = diet_template_foods.meal_id) AND (dt.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Users can manage their own template meals" ON "public"."diet_template_meals" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM diet_templates dt
  WHERE ((dt.id = diet_template_meals.template_id) AND (dt.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM diet_templates dt
  WHERE ((dt.id = diet_template_meals.template_id) AND (dt.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Users can manage their own diet templates" ON "public"."diet_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "document_layout_versions_active_read" ON "public"."document_layout_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM document_layouts l
  WHERE ((l.code = document_layout_versions.layout_code) AND l.is_active))));

CREATE POLICY "document_layouts_active_read" ON "public"."document_layouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_active);

CREATE POLICY "editor_shadow_drafts_owner_delete" ON "public"."editor_shadow_drafts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "editor_shadow_drafts_owner_insert" ON "public"."editor_shadow_drafts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "editor_shadow_drafts_owner_select" ON "public"."editor_shadow_drafts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "editor_shadow_drafts_owner_update" ON "public"."editor_shadow_drafts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((owner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Nutricionistas podem atualizar cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = energy_expenditure_calculations.patient_id) AND (user_profiles.nutritionist_id = auth_uid())))));

CREATE POLICY "Nutricionistas podem deletar cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = energy_expenditure_calculations.patient_id) AND (user_profiles.nutritionist_id = auth_uid())))));

CREATE POLICY "Nutricionistas podem inserir cálculos para seus pacientes" ON "public"."energy_expenditure_calculations" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = energy_expenditure_calculations.patient_id) AND (user_profiles.nutritionist_id = auth_uid())))));

CREATE POLICY "Nutricionistas podem ver cálculos dos seus pacientes" ON "public"."energy_expenditure_calculations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = energy_expenditure_calculations.patient_id) AND (user_profiles.nutritionist_id = auth_uid())))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = energy_expenditure_calculations.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."energy_expenditure_calculations" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = energy_expenditure_calculations.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = energy_expenditure_calculations.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Service role can do everything" ON "public"."external_api_cache" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "feed_tasks_delete_owner" ON "public"."feed_tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "feed_tasks_insert_owner" ON "public"."feed_tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "feed_tasks_select_owner" ON "public"."feed_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "feed_tasks_update_owner" ON "public"."feed_tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Nutritionists manage financial_records" ON "public"."financial_records" AS PERMISSIVE FOR ALL TO "authenticated" USING ((nutritionist_id = ( SELECT auth_uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth_uid() AS uid)));

CREATE POLICY "Nutritionists manage financial_transactions" ON "public"."financial_transactions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((nutritionist_id = ( SELECT auth_uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth_uid() AS uid)));

CREATE POLICY "Read food_household_measures" ON "public"."food_household_measures" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Create owned custom or admin reference measures" ON "public"."food_measures" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((((reference_food_id IS NOT NULL) AND ( SELECT private.is_admin() AS is_admin)) OR ((nutritionist_food_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM nutritionist_foods nf
  WHERE ((nf.id = food_measures.nutritionist_food_id) AND (nf.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Delete owned custom or admin reference measures" ON "public"."food_measures" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((((reference_food_id IS NOT NULL) AND ( SELECT private.is_admin() AS is_admin)) OR (EXISTS ( SELECT 1
   FROM nutritionist_foods nf
  WHERE ((nf.id = food_measures.nutritionist_food_id) AND (nf.nutritionist_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Read global or assigned food measures" ON "public"."food_measures" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((reference_food_id IS NOT NULL) OR (EXISTS ( SELECT 1
   FROM nutritionist_foods nf
  WHERE ((nf.id = food_measures.nutritionist_food_id) AND ((nf.nutritionist_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM nutritionist_patients np
          WHERE ((np.patient_id = ( SELECT auth.uid() AS uid)) AND (np.nutritionist_id = nf.nutritionist_id))))))))));

CREATE POLICY "Update owned custom or admin reference measures" ON "public"."food_measures" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((((reference_food_id IS NOT NULL) AND ( SELECT private.is_admin() AS is_admin)) OR (EXISTS ( SELECT 1
   FROM nutritionist_foods nf
  WHERE ((nf.id = food_measures.nutritionist_food_id) AND (nf.nutritionist_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((((reference_food_id IS NOT NULL) AND ( SELECT private.is_admin() AS is_admin)) OR (EXISTS ( SELECT 1
   FROM nutritionist_foods nf
  WHERE ((nf.id = food_measures.nutritionist_food_id) AND (nf.nutritionist_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Access glycemia_records" ON "public"."glycemia_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = glycemia_records.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = glycemia_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."glycemia_records" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = glycemia_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = glycemia_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "s02_glycemia_records_delete" ON "public"."glycemia_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = glycemia_records.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "s02_glycemia_records_insert" ON "public"."glycemia_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = glycemia_records.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "s02_glycemia_records_update" ON "public"."glycemia_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = glycemia_records.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))))) WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = glycemia_records.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "Users can manage growth records for their patients/themselves" ON "public"."growth_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = growth_records.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))) OR (((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = growth_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."growth_records" AS RESTRICTIVE FOR ALL TO "authenticated" USING ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = growth_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = growth_records.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "growth_records_clinical_insert_guard" ON "public"."growth_records" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (((care_episode_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = growth_records.care_episode_id) AND (ce.patient_id = growth_records.patient_id) AND (ce.nutritionist_id = ( SELECT auth.uid() AS uid)) AND (ce.status = 'active'::text))))));

CREATE POLICY "growth_records_clinical_update_guard" ON "public"."growth_records" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = growth_records.care_episode_id) AND (ce.patient_id = growth_records.patient_id) AND (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))) OR ((care_episode_id IS NULL) AND (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = growth_records.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)) AND (up.is_active IS TRUE))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = growth_records.care_episode_id) AND (ce.patient_id = growth_records.patient_id) AND (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))) OR ((care_episode_id IS NULL) AND (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = growth_records.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)) AND (up.is_active IS TRUE)))))));

CREATE POLICY "s02_growth_records_delete" ON "public"."growth_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = growth_records.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))));

CREATE POLICY "s02_growth_records_insert" ON "public"."growth_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = growth_records.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))));

CREATE POLICY "s02_growth_records_update" ON "public"."growth_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = growth_records.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = growth_records.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))));

CREATE POLICY "Read household_measures" ON "public"."household_measures" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Write household_measures delete (admin)" ON "public"."household_measures" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT private.is_admin() AS is_admin));

CREATE POLICY "Write household_measures insert (admin)" ON "public"."household_measures" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT private.is_admin() AS is_admin));

CREATE POLICY "Write household_measures update (admin)" ON "public"."household_measures" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));

CREATE POLICY "Access lab_results" ON "public"."lab_results" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = lab_results.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))) OR (((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = lab_results.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."lab_results" AS RESTRICTIVE FOR ALL TO "authenticated" USING ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = lab_results.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = lab_results.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "s02_lab_results_delete" ON "public"."lab_results" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = lab_results.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "s02_lab_results_insert" ON "public"."lab_results" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = lab_results.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "s02_lab_results_update" ON "public"."lab_results" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = lab_results.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))))) WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = lab_results.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "lab_risk_rules_delete_own" ON "public"."lab_risk_rules" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "lab_risk_rules_insert_own" ON "public"."lab_risk_rules" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "lab_risk_rules_select_scoped" ON "public"."lab_risk_rules" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((nutritionist_id IS NULL) OR (nutritionist_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "lab_risk_rules_update_own" ON "public"."lab_risk_rules" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "legal_guardian_events_participant_select" ON "public"."legal_guardian_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.can_read_legal_guardian_event(id));

CREATE POLICY "Access meal_audit_log" ON "public"."meal_audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meal_audit_log.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))) OR (((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_audit_log.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."meal_audit_log" AS RESTRICTIVE FOR ALL TO "authenticated" USING ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_audit_log.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_audit_log.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Nutritionists can view their patients meal edit history" ON "public"."meal_edit_history" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = meal_edit_history.patient_id) AND (p.nutritionist_id = auth_uid()) AND (p.is_active = true)))) OR (((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_edit_history.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))));

CREATE POLICY "Users can insert meal edit history for their own meals" ON "public"."meal_edit_history" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM meals m
  WHERE ((m.id = meal_edit_history.meal_id) AND (m.patient_id = private.get_user_id())))));

CREATE POLICY "b2_episode_isolation" ON "public"."meal_edit_history" AS RESTRICTIVE FOR ALL TO "authenticated" USING ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_edit_history.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_edit_history.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Access meal_history" ON "public"."meal_history" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((changed_by = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meal_history.changed_by) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "Access meal_items via meals" ON "public"."meal_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM meals m
  WHERE ((m.id = meal_items.meal_id) AND ((m.patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = m.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM meals m
  WHERE ((m.id = meal_items.meal_id) AND ((m.patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = m.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))))))));

CREATE POLICY "Access meal_plan_food_substitutions via meal_plan_foods" ON "public"."meal_plan_food_substitutions" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM ((meal_plan_foods mf
     JOIN meal_plan_meals m ON ((m.id = mf.meal_plan_meal_id)))
     JOIN meal_plans p ON ((p.id = m.meal_plan_id)))
  WHERE ((mf.id = meal_plan_food_substitutions.meal_plan_food_id) AND ((p.patient_id = ( SELECT auth.uid() AS uid)) OR ((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((meal_plan_foods mf
     JOIN meal_plan_meals m ON ((m.id = mf.meal_plan_meal_id)))
     JOIN meal_plans p ON ((p.id = m.meal_plan_id)))
  WHERE ((mf.id = meal_plan_food_substitutions.meal_plan_food_id) AND (((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Access meal_plan_foods via meal_plan_meals" ON "public"."meal_plan_foods" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM (meal_plan_meals m
     JOIN meal_plans p ON ((p.id = m.meal_plan_id)))
  WHERE ((m.id = meal_plan_foods.meal_plan_meal_id) AND ((p.patient_id = ( SELECT auth.uid() AS uid)) OR ((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (meal_plan_meals m
     JOIN meal_plans p ON ((p.id = m.meal_plan_id)))
  WHERE ((m.id = meal_plan_foods.meal_plan_meal_id) AND (((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Access meal_plan_meals via meal_plans" ON "public"."meal_plan_meals" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM meal_plans p
  WHERE ((p.id = meal_plan_meals.meal_plan_id) AND ((p.patient_id = ( SELECT auth.uid() AS uid)) OR ((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM meal_plans p
  WHERE ((p.id = meal_plan_meals.meal_plan_id) AND (((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Access meal_plan_reference_values via meal_plans" ON "public"."meal_plan_reference_values" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM meal_plans p
  WHERE ((p.id = meal_plan_reference_values.meal_plan_id) AND ((p.patient_id = ( SELECT auth.uid() AS uid)) OR ((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM meal_plans p
  WHERE ((p.id = meal_plan_reference_values.meal_plan_id) AND (((p.patient_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_profiles up
          WHERE ((up.id = p.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR ((p.patient_id IS NULL) AND (p.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "meal_plan_versions_episode_select" ON "public"."meal_plan_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) OR ((care_episode_id IS NOT NULL) AND private.can_read_care_episode(care_episode_id))));

CREATE POLICY "Nutritionists delete meal_plans" ON "public"."meal_plans" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((is_draft AND private.can_write_active_meal_plan(patient_id, nutritionist_id, care_episode_id)));

CREATE POLICY "Nutritionists insert meal_plans" ON "public"."meal_plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.can_write_active_meal_plan(patient_id, nutritionist_id, care_episode_id));

CREATE POLICY "Nutritionists update meal_plans" ON "public"."meal_plans" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.can_write_active_meal_plan(patient_id, nutritionist_id, care_episode_id)) WITH CHECK (private.can_write_active_meal_plan(patient_id, nutritionist_id, care_episode_id));

CREATE POLICY "Read meal_plans" ON "public"."meal_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) OR ((patient_id IS NULL) AND (nutritionist_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_plans.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_plans.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."meal_plans" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_plans.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meal_plans.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Users can manage their own meal template substitutions" ON "public"."meal_template_food_substitutions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (meal_template_foods mtf
     JOIN meal_templates mt ON ((mt.id = mtf.meal_template_id)))
  WHERE ((mtf.id = meal_template_food_substitutions.template_food_id) AND (mt.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (meal_template_foods mtf
     JOIN meal_templates mt ON ((mt.id = mtf.meal_template_id)))
  WHERE ((mtf.id = meal_template_food_substitutions.template_food_id) AND (mt.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Users can manage their own meal template foods" ON "public"."meal_template_foods" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM meal_templates mt
  WHERE ((mt.id = meal_template_foods.meal_template_id) AND (mt.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM meal_templates mt
  WHERE ((mt.id = meal_template_foods.meal_template_id) AND (mt.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Users can manage their own meal templates" ON "public"."meal_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Access meals for patient or nutritionist" ON "public"."meals" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meals.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))) OR (((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meals.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."meals" AS RESTRICTIVE FOR ALL TO "authenticated" USING ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meals.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((((care_episode_id IS NULL) AND (patient_id = ( SELECT auth.uid() AS uid))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = meals.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "s02_meals_delete" ON "public"."meals" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meals.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "s02_meals_insert" ON "public"."meals" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meals.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "s02_meals_update" ON "public"."meals" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meals.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))))) WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meals.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "message_templates_delete_own" ON "public"."message_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "message_templates_insert_own" ON "public"."message_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "message_templates_select" ON "public"."message_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id IS NULL) OR (nutritionist_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "message_templates_update_own" ON "public"."message_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "notification_rules_delete_owner_or_admin" ON "public"."notification_rules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "notification_rules_insert_owner_or_admin" ON "public"."notification_rules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "notification_rules_select_owner_or_global" ON "public"."notification_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id IS NULL) OR (nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "notification_rules_update_owner_or_admin" ON "public"."notification_rules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Users can manage their own notifications" ON "public"."notifications" AS PERMISSIVE FOR ALL TO PUBLIC USING ((private.get_user_id() = user_id));

CREATE POLICY "Delete branding" ON "public"."nutritionist_branding" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Escrita branding" ON "public"."nutritionist_branding" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Leitura branding" ON "public"."nutritionist_branding" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (nutritionist_id IN ( SELECT nutritionist_patients.nutritionist_id
   FROM nutritionist_patients
  WHERE (nutritionist_patients.patient_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Update branding" ON "public"."nutritionist_branding" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "nutritionist_custom_measures_delete" ON "public"."nutritionist_custom_measures" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = nutritionist_id));

CREATE POLICY "nutritionist_custom_measures_insert" ON "public"."nutritionist_custom_measures" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((( SELECT auth.uid() AS uid) = nutritionist_id) AND (( SELECT count(*) AS count
   FROM nutritionist_custom_measures existing_measure
  WHERE (existing_measure.nutritionist_id = ( SELECT auth.uid() AS uid))) < 20)));

CREATE POLICY "nutritionist_custom_measures_select" ON "public"."nutritionist_custom_measures" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = nutritionist_id));

CREATE POLICY "nutritionist_custom_measures_update" ON "public"."nutritionist_custom_measures" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = nutritionist_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = nutritionist_id));

CREATE POLICY "Nutri deletes own foods" ON "public"."nutritionist_foods" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = nutritionist_id));

CREATE POLICY "Nutri manages own foods" ON "public"."nutritionist_foods" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = nutritionist_id));

CREATE POLICY "Nutri or patient reads foods" ON "public"."nutritionist_foods" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((( SELECT auth.uid() AS uid) = nutritionist_id) OR (EXISTS ( SELECT 1
   FROM nutritionist_patients np
  WHERE ((np.patient_id = ( SELECT auth.uid() AS uid)) AND (np.nutritionist_id = nutritionist_foods.nutritionist_id))))));

CREATE POLICY "Nutri updates own foods" ON "public"."nutritionist_foods" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = nutritionist_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = nutritionist_id));

CREATE POLICY "nutritionist_patients_delete_own" ON "public"."nutritionist_patients" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "nutritionist_patients_insert_own" ON "public"."nutritionist_patients" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "nutritionist_patients_select" ON "public"."nutritionist_patients" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "nutritionist_patients_update_own" ON "public"."nutritionist_patients" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "operational_observability_insert_authenticated" ON "public"."operational_observability_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "operational_observability_select_scoped" ON "public"."operational_observability_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "legal_guardians_participant_select" ON "public"."patient_episode_legal_guardians" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.can_read_care_episode(care_episode_id));

CREATE POLICY "Nutritionists can delete patient goals" ON "public"."patient_goals" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((nutritionist_id = auth_uid()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth_uid()) AND (user_profiles.user_type = 'nutritionist'::text))))));

CREATE POLICY "Nutritionists can insert patient goals" ON "public"."patient_goals" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((nutritionist_id = auth_uid()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth_uid()) AND (user_profiles.user_type = 'nutritionist'::text))))));

CREATE POLICY "Nutritionists can update patient goals" ON "public"."patient_goals" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((nutritionist_id = auth_uid()) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth_uid()) AND (user_profiles.user_type = 'nutritionist'::text))))));

CREATE POLICY "Read patient_goals" ON "public"."patient_goals" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = auth_uid()) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth_uid()) AND (user_profiles.user_type = 'nutritionist'::text) AND (user_profiles.id = ( SELECT user_profiles_1.nutritionist_id
           FROM user_profiles user_profiles_1
          WHERE (user_profiles_1.id = patient_goals.patient_id)))))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = patient_goals.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."patient_goals" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = patient_goals.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = patient_goals.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "patient_module_sync_flags_delete_nutritionist" ON "public"."patient_module_sync_flags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "patient_module_sync_flags_insert_nutritionist" ON "public"."patient_module_sync_flags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "patient_module_sync_flags_select_involved" ON "public"."patient_module_sync_flags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "patient_module_sync_flags_update_nutritionist_only" ON "public"."patient_module_sync_flags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "patient_profile_events_participant_select" ON "public"."patient_profile_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) OR ((care_episode_id IS NOT NULL) AND private.can_read_care_episode(care_episode_id))));

CREATE POLICY "patient_progress_measurements_care_team_select" ON "public"."patient_progress_measurements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM care_episodes e
  WHERE ((e.patient_id = patient_progress_measurements.patient_id) AND (e.status = 'active'::text) AND private.can_read_care_episode(e.id)))));

CREATE POLICY "patient_progress_measurements_self_insert" ON "public"."patient_progress_measurements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "patient_progress_measurements_self_select" ON "public"."patient_progress_measurements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "patient_reminder_preferences_insert_own" ON "public"."patient_reminder_preferences" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "patient_reminder_preferences_select_own" ON "public"."patient_reminder_preferences" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "patient_reminder_preferences_update_own" ON "public"."patient_reminder_preferences" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((patient_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Nutritionists can create prescriptions" ON "public"."prescriptions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((private.get_user_id() = nutritionist_id));

CREATE POLICY "Nutritionists can delete their own prescriptions" ON "public"."prescriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((private.get_user_id() = nutritionist_id));

CREATE POLICY "Nutritionists can update their own prescriptions" ON "public"."prescriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((private.get_user_id() = nutritionist_id)) WITH CHECK ((private.get_user_id() = nutritionist_id));

CREATE POLICY "Users can see their own prescriptions" ON "public"."prescriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE (((p.id = prescriptions.patient_id) OR (p.id = prescriptions.nutritionist_id)) AND (p.id = auth_uid()) AND (p.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM (user_profiles p_patient
     JOIN user_profiles p_nutri ON ((p_patient.nutritionist_id = p_nutri.id)))
  WHERE ((p_patient.id = prescriptions.patient_id) AND (p_nutri.id = auth_uid()) AND (p_patient.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = prescriptions.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."prescriptions" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = prescriptions.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = prescriptions.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "professional_verifications_select_owner_or_admin" ON "public"."professional_verifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

CREATE POLICY "progress_photos_active_episode_insert" ON "public"."progress_photos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((status = 'active'::text) AND (storage_path IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM care_episodes episode
  WHERE ((episode.id = progress_photos.care_episode_id) AND (episode.patient_id = episode.patient_id) AND (episode.status = 'active'::text) AND ((episode.patient_id = ( SELECT auth.uid() AS uid)) OR (episode.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "progress_photos_active_metadata_update" ON "public"."progress_photos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((status = 'active'::text) AND (EXISTS ( SELECT 1
   FROM care_episodes episode
  WHERE ((episode.id = progress_photos.care_episode_id) AND ((episode.patient_id = ( SELECT auth.uid() AS uid)) OR (episode.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM care_episodes episode
  WHERE ((episode.id = progress_photos.care_episode_id) AND ((episode.patient_id = ( SELECT auth.uid() AS uid)) OR (episode.nutritionist_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "progress_photos_participant_select" ON "public"."progress_photos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM care_episodes episode
  WHERE ((episode.id = progress_photos.care_episode_id) AND (episode.patient_id = episode.patient_id) AND ((episode.patient_id = ( SELECT auth.uid() AS uid)) OR (episode.nutritionist_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Users can manage their own recipe ingredients" ON "public"."recipe_ingredients" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Users can manage their own recipes" ON "public"."recipes" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Nutritionists manage recurring_expenses" ON "public"."recurring_expenses" AS PERMISSIVE FOR ALL TO "authenticated" USING ((nutritionist_id = ( SELECT auth_uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth_uid() AS uid)));

CREATE POLICY "Public read access" ON "public"."reference_foods" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "reminder_delivery_log_insert_service_role" ON "public"."reminder_delivery_log" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((patient_id IS NOT NULL) AND (reminder_type = ANY (ARRAY['daily_log_reminder'::text, 'measurement_reminder'::text])) AND (delivery_channel = 'in_app'::text)));

CREATE POLICY "reminder_delivery_log_select" ON "public"."reminder_delivery_log" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((patient_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = reminder_delivery_log.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Nutritionists manage services" ON "public"."services" AS PERMISSIVE FOR ALL TO "authenticated" USING ((nutritionist_id = ( SELECT auth_uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth_uid() AS uid)));

CREATE POLICY "student_supervision_events_select_participant_or_admin" ON "public"."student_supervision_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((student_id = ( SELECT auth.uid() AS uid)) OR (supervisor_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

CREATE POLICY "student_supervisions_select_participant_or_admin" ON "public"."student_supervisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((student_id = ( SELECT auth.uid() AS uid)) OR (supervisor_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

CREATE POLICY "Delete suplementos" ON "public"."supplement_logs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Escrita suplementos" ON "public"."supplement_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Leitura suplementos" ON "public"."supplement_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) OR (nutritionist_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = supplement_logs.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Update suplementos" ON "public"."supplement_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((patient_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "b2_episode_isolation" ON "public"."supplement_logs" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = supplement_logs.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = supplement_logs.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "template_dispatch_log_insert_own" ON "public"."template_dispatch_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "template_dispatch_log_select_scoped" ON "public"."template_dispatch_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "user_achievements_select" ON "public"."user_achievements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM nutritionist_patients np
  WHERE ((np.nutritionist_id = ( SELECT auth.uid() AS uid)) AND (np.patient_id = user_achievements.user_id))))));

CREATE POLICY "Read user_profiles" ON "public"."user_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((id = ( SELECT auth_uid() AS uid)) OR (( SELECT private.is_nutritionist() AS is_nutritionist) AND (user_type = 'patient'::text) AND (nutritionist_id = ( SELECT auth_uid() AS uid)))));

CREATE POLICY "Users can insert own profile (temporary)" ON "public"."user_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((id = ( SELECT auth_uid() AS uid)) AND (user_type = ANY (ARRAY['patient'::text, 'nutritionist'::text])) AND (is_admin IS NOT TRUE)));

CREATE POLICY "Users can update profile" ON "public"."user_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((id = ( SELECT auth.uid() AS uid)) OR ((user_type = 'patient'::text) AND (nutritionist_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((((id = ( SELECT auth.uid() AS uid)) AND (NOT (is_admin IS DISTINCT FROM ( SELECT pa.is_admin
   FROM private.get_own_profile_attrs() pa(is_admin, user_type)))) AND (NOT (user_type IS DISTINCT FROM ( SELECT pa.user_type
   FROM private.get_own_profile_attrs() pa(is_admin, user_type))))) OR ((user_type = 'patient'::text) AND (nutritionist_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "verification_documents_select_owner_or_admin" ON "public"."verification_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((owner_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));

CREATE POLICY "verification_events_select_owner_or_admin" ON "public"."verification_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_admin() OR (EXISTS ( SELECT 1
   FROM professional_verifications v
  WHERE ((v.id = verification_events.verification_id) AND (v.user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Users can manage their own summaries" ON "public"."weekly_summaries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = weekly_summaries.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = weekly_summaries.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "b2_episode_isolation" ON "public"."weekly_summaries" AS RESTRICTIVE FOR ALL TO "authenticated" USING (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = weekly_summaries.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK (((patient_id IS NULL) OR (EXISTS ( SELECT 1
   FROM care_episodes ce
  WHERE ((ce.id = weekly_summaries.care_episode_id) AND ((ce.patient_id = ( SELECT auth.uid() AS uid)) OR (ce.nutritionist_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "s02_weekly_summaries_delete" ON "public"."weekly_summaries" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = weekly_summaries.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))));

CREATE POLICY "s02_weekly_summaries_insert" ON "public"."weekly_summaries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = weekly_summaries.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))));

CREATE POLICY "s02_weekly_summaries_update" ON "public"."weekly_summaries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = weekly_summaries.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id = weekly_summaries.patient_id) AND ((p.id = auth_uid()) OR (p.nutritionist_id = auth_uid())) AND (p.is_active = true)))));

CREATE POLICY "Access chat_media delete" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Access chat_media insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Access chat_media read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'chat_media'::text) AND (EXISTS ( SELECT 1
   FROM chats c
  WHERE (((c.media_url = objects.name) OR (c.media_url ~~ ('%/'::text || objects.name))) AND ((c.from_id = auth.uid()) OR (c.to_id = auth.uid())))))));

CREATE POLICY "Access chat_media update" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Access financial-docs" ON "storage"."objects" AS PERMISSIVE FOR ALL TO "authenticated" USING (((bucket_id = 'financial-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'financial-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Access lab-results-pdfs" ON "storage"."objects" AS PERMISSIVE FOR ALL TO "authenticated" USING (((bucket_id = 'lab-results-pdfs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id =
        CASE
            WHEN ((storage.foldername(p.name))[1] ~* '^[0-9a-f-]{36}$'::text) THEN ((storage.foldername(p.name))[1])::uuid
            ELSE NULL::uuid
        END) AND (p.nutritionist_id = auth.uid()))))))) WITH CHECK (((bucket_id = 'lab-results-pdfs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.id =
        CASE
            WHEN ((storage.foldername(p.name))[1] ~* '^[0-9a-f-]{36}$'::text) THEN ((storage.foldername(p.name))[1])::uuid
            ELSE NULL::uuid
        END) AND (p.nutritionist_id = auth.uid())))))));

CREATE POLICY "Authenticated users can delete PDFs" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY "Authenticated users can update PDFs" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text))) WITH CHECK (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY "Authenticated users can upload PDFs" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY "Authenticated users can view PDFs" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY "Authenticated users can view avatars" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY "Nutritionists can manage patient avatars" ON "storage"."objects" AS PERMISSIVE FOR ALL TO "authenticated" USING (((bucket_id = 'avatars'::text) AND (EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE (((p.id)::text = (storage.foldername(objects.name))[1]) AND (p.nutritionist_id = auth.uid())))))) WITH CHECK (((bucket_id = 'avatars'::text) AND (EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE (((p.id)::text = (storage.foldername(objects.name))[1]) AND (p.nutritionist_id = auth.uid()))))));

CREATE POLICY "Users can insert their own chat media" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can manage their own avatar" ON "storage"."objects" AS PERMISSIVE FOR ALL TO PUBLIC USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can manage their own chat media" ON "storage"."objects" AS PERMISSIVE FOR ALL TO PUBLIC USING (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users manage own avatars" ON "storage"."objects" AS PERMISSIVE FOR ALL TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "anamnesis_files_delete" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "anon","authenticated" USING (((bucket_id = 'anamnesis-attachments'::text) AND private.can_access_anamnesis_attachment_object(name, true)));

CREATE POLICY "anamnesis_files_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK (((bucket_id = 'anamnesis-attachments'::text) AND private.can_access_anamnesis_attachment_object(name, true)));

CREATE POLICY "anamnesis_files_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "anon","authenticated" USING (((bucket_id = 'anamnesis-attachments'::text) AND private.can_access_anamnesis_attachment_object(name, false)));

CREATE POLICY "clinical_attachments_insert_reserved_intent" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.can_upload_clinical_attachment_object(bucket_id, name));

CREATE POLICY "clinical_attachments_select_authorized" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.can_read_clinical_attachment_object(bucket_id, name));

CREATE POLICY "document_assets_insert_reserved_intent" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.can_upload_document_asset_object(bucket_id, name));

CREATE POLICY "document_assets_select_current_owner" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.can_read_document_asset_object(bucket_id, name));

CREATE POLICY "patient_photos_orphan_cleanup" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'patient-photos'::text) AND (owner_id = (auth.uid())::text) AND (NOT (EXISTS ( SELECT 1
   FROM progress_photos photo
  WHERE (photo.storage_path = objects.name))))));

CREATE POLICY "patient_photos_private_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'patient-photos'::text) AND private.can_upload_patient_photo_object(name)));

CREATE POLICY "patient_photos_private_select" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'patient-photos'::text) AND private.can_access_patient_photo_object(name)));
