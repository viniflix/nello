-- CI-only restoration of unrecorded table metadata; never push to a hosted project.

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."bug_reports"'::regclass AND conname='bug_reports_user_id_fkey') THEN ALTER TABLE public."bug_reports" ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $gap$;

CREATE INDEX IF NOT EXISTS idx_bug_reports_bug_type ON public.bug_reports USING btree (bug_type);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created_resolved ON public.bug_reports USING btree (created_at DESC, is_resolved);

CREATE INDEX IF NOT EXISTS idx_bug_reports_is_resolved ON public.bug_reports USING btree (is_resolved);

CREATE INDEX IF NOT EXISTS idx_bug_reports_route ON public.bug_reports USING btree (route);

CREATE INDEX IF NOT EXISTS idx_bug_reports_severity ON public.bug_reports USING btree (severity);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user_email ON public.bug_reports USING btree (user_email);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports USING btree (user_id);

DROP POLICY IF EXISTS "Admins can delete bug reports" ON public."bug_reports";

CREATE POLICY "Admins can delete bug reports" ON public."bug_reports" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.is_admin = true)))));

DROP POLICY IF EXISTS "Admins can update bug reports" ON public."bug_reports";

CREATE POLICY "Admins can update bug reports" ON public."bug_reports" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.is_admin = true)))));

DROP POLICY IF EXISTS "Admins can view all bug reports" ON public."bug_reports";

CREATE POLICY "Admins can view all bug reports" ON public."bug_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.is_admin = true)))));

DROP POLICY IF EXISTS "Users can insert bug reports" ON public."bug_reports";

CREATE POLICY "Users can insert bug reports" ON public."bug_reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."bug_reports" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."bug_reports" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."bug_reports" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."bug_reports" TO "service_role";

DROP TRIGGER IF EXISTS "trigger_update_bug_reports_updated_at" ON public."bug_reports";

CREATE TRIGGER trigger_update_bug_reports_updated_at BEFORE UPDATE ON public.bug_reports FOR EACH ROW EXECUTE FUNCTION update_bug_reports_updated_at();

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."feed_tasks"'::regclass AND conname='feed_tasks_nutritionist_id_fkey') THEN ALTER TABLE public."feed_tasks" ADD CONSTRAINT "feed_tasks_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."feed_tasks"'::regclass AND conname='feed_tasks_patient_id_fkey') THEN ALTER TABLE public."feed_tasks" ADD CONSTRAINT "feed_tasks_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL; END IF; END $gap$;

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."feed_tasks"'::regclass AND conname='feed_tasks_resolved_by_fkey') THEN ALTER TABLE public."feed_tasks" ADD CONSTRAINT "feed_tasks_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL; END IF; END $gap$;

CREATE INDEX IF NOT EXISTS idx_feed_tasks_nutritionist_resolved ON public.feed_tasks USING btree (nutritionist_id, resolved_at) WHERE (resolved_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_feed_tasks_nutritionist_status ON public.feed_tasks USING btree (nutritionist_id, status) WHERE (status <> 'resolved'::text);

CREATE INDEX IF NOT EXISTS idx_feed_tasks_nutritionist_status_updated ON public.feed_tasks USING btree (nutritionist_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_tasks_patient_id ON public.feed_tasks USING btree (patient_id);

CREATE INDEX IF NOT EXISTS idx_feed_tasks_resolved_by ON public.feed_tasks USING btree (resolved_by);

DROP POLICY IF EXISTS "feed_tasks_delete_owner" ON public."feed_tasks";

CREATE POLICY "feed_tasks_delete_owner" ON public."feed_tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "feed_tasks_insert_owner" ON public."feed_tasks";

CREATE POLICY "feed_tasks_insert_owner" ON public."feed_tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "feed_tasks_select_owner" ON public."feed_tasks";

CREATE POLICY "feed_tasks_select_owner" ON public."feed_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "feed_tasks_update_owner" ON public."feed_tasks";

CREATE POLICY "feed_tasks_update_owner" ON public."feed_tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."feed_tasks" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."feed_tasks" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."feed_tasks" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."feed_tasks" TO "service_role";

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."message_templates"'::regclass AND conname='message_templates_nutritionist_id_fkey') THEN ALTER TABLE public."message_templates" ADD CONSTRAINT "message_templates_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

CREATE UNIQUE INDEX IF NOT EXISTS message_templates_default_template_key_key ON public.message_templates USING btree (template_key) WHERE (nutritionist_id IS NULL);

CREATE INDEX IF NOT EXISTS message_templates_nutritionist_created_idx ON public.message_templates USING btree (nutritionist_id, created_at DESC);

DROP POLICY IF EXISTS "message_templates_delete_own" ON public."message_templates";

CREATE POLICY "message_templates_delete_own" ON public."message_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "message_templates_insert_own" ON public."message_templates";

CREATE POLICY "message_templates_insert_own" ON public."message_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "message_templates_select" ON public."message_templates";

CREATE POLICY "message_templates_select" ON public."message_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id IS NULL) OR (nutritionist_id = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "message_templates_update_own" ON public."message_templates";

CREATE POLICY "message_templates_update_own" ON public."message_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."message_templates" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."message_templates" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."message_templates" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."message_templates" TO "service_role";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."message_templates_id_seq" TO "postgres";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."message_templates_id_seq" TO "anon";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."message_templates_id_seq" TO "authenticated";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."message_templates_id_seq" TO "service_role";

DROP TRIGGER IF EXISTS "trg_set_message_templates_updated_at" ON public."message_templates";

CREATE TRIGGER trg_set_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION set_message_templates_updated_at();

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."notification_rules"'::regclass AND conname='notification_rules_nutritionist_id_fkey') THEN ALTER TABLE public."notification_rules" ADD CONSTRAINT "notification_rules_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

CREATE INDEX IF NOT EXISTS idx_notification_rules_nutritionist_id ON public.notification_rules USING btree (nutritionist_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_rules_scope_owner_key ON public.notification_rules USING btree (scope, COALESCE(nutritionist_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_key);

DROP POLICY IF EXISTS "notification_rules_delete_owner_or_admin" ON public."notification_rules";

CREATE POLICY "notification_rules_delete_owner_or_admin" ON public."notification_rules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

DROP POLICY IF EXISTS "notification_rules_insert_owner_or_admin" ON public."notification_rules";

CREATE POLICY "notification_rules_insert_owner_or_admin" ON public."notification_rules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

DROP POLICY IF EXISTS "notification_rules_select_owner_or_global" ON public."notification_rules";

CREATE POLICY "notification_rules_select_owner_or_global" ON public."notification_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id IS NULL) OR (nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

DROP POLICY IF EXISTS "notification_rules_update_owner_or_admin" ON public."notification_rules";

CREATE POLICY "notification_rules_update_owner_or_admin" ON public."notification_rules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."notification_rules" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."notification_rules" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."notification_rules" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."notification_rules" TO "service_role";

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."nutritionist_patients"'::regclass AND conname='nutritionist_patients_nutritionist_id_fkey') THEN ALTER TABLE public."nutritionist_patients" ADD CONSTRAINT "nutritionist_patients_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."nutritionist_patients"'::regclass AND conname='nutritionist_patients_patient_id_fkey') THEN ALTER TABLE public."nutritionist_patients" ADD CONSTRAINT "nutritionist_patients_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

CREATE INDEX IF NOT EXISTS idx_nutritionist_patients_patient_id ON public.nutritionist_patients USING btree (patient_id);

CREATE UNIQUE INDEX IF NOT EXISTS nutritionist_patients_one_active_nutritionist_per_patient ON public.nutritionist_patients USING btree (patient_id) WHERE (status = 'active'::text);

DROP POLICY IF EXISTS "nutritionist_patients_delete_own" ON public."nutritionist_patients";

CREATE POLICY "nutritionist_patients_delete_own" ON public."nutritionist_patients" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "nutritionist_patients_insert_own" ON public."nutritionist_patients";

CREATE POLICY "nutritionist_patients_insert_own" ON public."nutritionist_patients" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "nutritionist_patients_select" ON public."nutritionist_patients";

CREATE POLICY "nutritionist_patients_select" ON public."nutritionist_patients" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "nutritionist_patients_update_own" ON public."nutritionist_patients";

CREATE POLICY "nutritionist_patients_update_own" ON public."nutritionist_patients" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((nutritionist_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."nutritionist_patients" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."nutritionist_patients" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."nutritionist_patients" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."nutritionist_patients" TO "service_role";

DROP TRIGGER IF EXISTS "trg_enforce_verified_patient_link" ON public."nutritionist_patients";

CREATE TRIGGER trg_enforce_verified_patient_link BEFORE INSERT OR UPDATE OF nutritionist_id, patient_id, status ON public.nutritionist_patients FOR EACH ROW EXECUTE FUNCTION private.enforce_verified_patient_link();

DROP TRIGGER IF EXISTS "trg_sync_care_episode_for_active_link" ON public."nutritionist_patients";

CREATE TRIGGER trg_sync_care_episode_for_active_link AFTER INSERT OR UPDATE OF status ON public.nutritionist_patients FOR EACH ROW EXECUTE FUNCTION private.sync_care_episode_for_active_link();

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."operational_observability_log"'::regclass AND conname='operational_observability_log_nutritionist_id_fkey') THEN ALTER TABLE public."operational_observability_log" ADD CONSTRAINT "operational_observability_log_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL; END IF; END $gap$;

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."operational_observability_log"'::regclass AND conname='operational_observability_log_patient_id_fkey') THEN ALTER TABLE public."operational_observability_log" ADD CONSTRAINT "operational_observability_log_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL; END IF; END $gap$;

CREATE INDEX IF NOT EXISTS idx_operational_observability_patient_id ON public.operational_observability_log USING btree (patient_id);

CREATE INDEX IF NOT EXISTS operational_observability_log_nutritionist_created_idx ON public.operational_observability_log USING btree (nutritionist_id, created_at DESC);

DROP POLICY IF EXISTS "operational_observability_insert_authenticated" ON public."operational_observability_log";

CREATE POLICY "operational_observability_insert_authenticated" ON public."operational_observability_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

DROP POLICY IF EXISTS "operational_observability_select_scoped" ON public."operational_observability_log";

CREATE POLICY "operational_observability_select_scoped" ON public."operational_observability_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."operational_observability_log" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."operational_observability_log" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."operational_observability_log" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."operational_observability_log" TO "service_role";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."operational_observability_log_id_seq" TO "postgres";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."operational_observability_log_id_seq" TO "anon";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."operational_observability_log_id_seq" TO "authenticated";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."operational_observability_log_id_seq" TO "service_role";

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."patient_module_sync_flags"'::regclass AND conname='patient_module_sync_flags_patient_id_fkey') THEN ALTER TABLE public."patient_module_sync_flags" ADD CONSTRAINT "patient_module_sync_flags_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

DROP POLICY IF EXISTS "patient_module_sync_flags_delete_nutritionist" ON public."patient_module_sync_flags";

CREATE POLICY "patient_module_sync_flags_delete_nutritionist" ON public."patient_module_sync_flags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "patient_module_sync_flags_insert_nutritionist" ON public."patient_module_sync_flags";

CREATE POLICY "patient_module_sync_flags_insert_nutritionist" ON public."patient_module_sync_flags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "patient_module_sync_flags_select_involved" ON public."patient_module_sync_flags";

CREATE POLICY "patient_module_sync_flags_select_involved" ON public."patient_module_sync_flags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((patient_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "patient_module_sync_flags_update_nutritionist_only" ON public."patient_module_sync_flags";

CREATE POLICY "patient_module_sync_flags_update_nutritionist_only" ON public."patient_module_sync_flags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = patient_module_sync_flags.patient_id) AND (up.nutritionist_id = ( SELECT auth.uid() AS uid))))));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."patient_module_sync_flags" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."patient_module_sync_flags" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."patient_module_sync_flags" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."patient_module_sync_flags" TO "service_role";

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."template_dispatch_log"'::regclass AND conname='template_dispatch_log_nutritionist_id_fkey') THEN ALTER TABLE public."template_dispatch_log" ADD CONSTRAINT "template_dispatch_log_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."template_dispatch_log"'::regclass AND conname='template_dispatch_log_patient_id_fkey') THEN ALTER TABLE public."template_dispatch_log" ADD CONSTRAINT "template_dispatch_log_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE; END IF; END $gap$;

DO $gap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."template_dispatch_log"'::regclass AND conname='template_dispatch_log_template_id_fkey') THEN ALTER TABLE public."template_dispatch_log" ADD CONSTRAINT "template_dispatch_log_template_id_fkey" FOREIGN KEY (template_id) REFERENCES message_templates(id) ON DELETE CASCADE; END IF; END $gap$;

CREATE INDEX IF NOT EXISTS idx_template_dispatch_log_template_id ON public.template_dispatch_log USING btree (template_id);

CREATE INDEX IF NOT EXISTS template_dispatch_log_nutritionist_created_idx ON public.template_dispatch_log USING btree (nutritionist_id, created_at DESC);

CREATE INDEX IF NOT EXISTS template_dispatch_log_patient_created_idx ON public.template_dispatch_log USING btree (patient_id, created_at DESC);

DROP POLICY IF EXISTS "template_dispatch_log_insert_own" ON public."template_dispatch_log";

CREATE POLICY "template_dispatch_log_insert_own" ON public."template_dispatch_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((nutritionist_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "template_dispatch_log_select_scoped" ON public."template_dispatch_log";

CREATE POLICY "template_dispatch_log_select_scoped" ON public."template_dispatch_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((nutritionist_id = ( SELECT auth.uid() AS uid)) OR (patient_id = ( SELECT auth.uid() AS uid))));

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."template_dispatch_log" TO "postgres";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."template_dispatch_log" TO "anon";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."template_dispatch_log" TO "authenticated";

GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public."template_dispatch_log" TO "service_role";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."template_dispatch_log_id_seq" TO "postgres";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."template_dispatch_log_id_seq" TO "anon";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."template_dispatch_log_id_seq" TO "authenticated";

GRANT SELECT,UPDATE,USAGE ON SEQUENCE public."template_dispatch_log_id_seq" TO "service_role";
