-- Emergency compatible rollback: pause delivery and retain the entire outbox.
-- Apply only after recording the deployed migration and its function checksum.
-- An application rollback alone does not undo notifications already available.
-- Do not restore the legacy sender: its reminder_sent_at flag does not cover
-- notices delivered by the outbox and would allow duplicate messages.
-- Resume by restoring only private.deliver_agenda_notice from the exact,
-- checksum-verified deployed migration, after validating the cause locally.
BEGIN;
SET LOCAL ROLE postgres;
CREATE OR REPLACE FUNCTION private.deliver_agenda_notice(p_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 RETURN false;
END $f$;
REVOKE ALL ON FUNCTION private.deliver_agenda_notice(bigint) FROM PUBLIC,anon,authenticated;
COMMIT;
