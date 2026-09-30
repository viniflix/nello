-- CI-only prerequisites: five manually consolidated base policies absent from CREATE history.

-- ALL expressions come from three matching preserved s02 write policies.

-- SELECT expressions remove only the appended episode OR clause; the recorded migration adds it back.

-- The complete live policy snapshot and independent catalog comparison remain the final authority.

CREATE POLICY "Access glycemia_records" ON public."glycemia_records" FOR ALL TO authenticated USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = glycemia_records.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))))) WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = glycemia_records.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "Access lab_results" ON public."lab_results" FOR ALL TO authenticated USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = lab_results.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))))) WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = lab_results.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "Access meal_audit_log" ON public."meal_audit_log" FOR SELECT TO authenticated USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meal_audit_log.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "Access meals for patient or nutritionist" ON public."meals" FOR ALL TO authenticated USING (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meals.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid))))))) WITH CHECK (((patient_id = ( SELECT auth_uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = meals.patient_id) AND (up.nutritionist_id = ( SELECT auth_uid() AS uid)))))));

CREATE POLICY "Read patient_goals" ON public."patient_goals" FOR SELECT TO authenticated USING (((patient_id = auth_uid()) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth_uid()) AND (user_profiles.user_type = 'nutritionist'::text) AND (user_profiles.id = ( SELECT user_profiles_1.nutritionist_id
           FROM user_profiles user_profiles_1
          WHERE (user_profiles_1.id = patient_goals.patient_id))))))));
