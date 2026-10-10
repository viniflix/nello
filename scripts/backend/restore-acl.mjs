// pg_dump omits explicit ACLs equal to PostgreSQL's built-in owner-only default.
// Materialize that representation in the disposable clone, without changing any
// effective privileges or accepting drift in the independent catalog comparator.
export function defaultOwnerAclSql(catalog, database) {
  if (database !== 'nello_qa_wave02_template' && !/^nello_wave03_recovery_[a-f0-9]{12}$/.test(database)) throw Error('ACL materialization requires the isolated restore database');
  const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
  const relations = catalog.relations.filter((r) => ['public', 'private'].includes(r.schema)
    && ['r', 'p', 'S'].includes(r.kind) && /^[a-z_][a-z0-9_]*$/.test(r.owner)
    && r.grants === `{${r.owner}=${r.kind === 'S' ? 'rwU' : 'arwdDxtm'}/${r.owner}}`);
  const expected = literal(JSON.stringify(relations.map(({ schema, name, kind, grants }) => ({ schema, name, kind, grants }))));
  return `DO $restore_acl$
DECLARE expected record; actual record;
BEGIN
  IF current_database() <> ${literal(database)} OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'ACL materialization outside isolated restore database';
  END IF;
  FOR expected IN SELECT * FROM jsonb_to_recordset(${expected}::jsonb)
    AS x(schema text, name text, kind text, grants text)
  LOOP
    SELECT c.oid, c.relacl, pg_get_userbyid(c.relowner) AS owner,
      acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner)::text AS default_acl
      INTO STRICT actual FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=expected.schema AND c.relname=expected.name AND c.relkind::text=expected.kind;
    IF actual.relacl IS NULL THEN
      IF actual.default_acl <> expected.grants THEN
        RAISE EXCEPTION 'Unexpected owner/default privileges on %.%', expected.schema, expected.name;
      END IF;
      IF expected.kind='S' THEN
        EXECUTE format('GRANT ALL PRIVILEGES ON SEQUENCE %I.%I TO %I', expected.schema, expected.name, actual.owner);
      ELSE
        EXECUTE format('GRANT ALL PRIVILEGES ON TABLE %I.%I TO %I', expected.schema, expected.name, actual.owner);
      END IF;
    END IF;
    -- Non-default ACLs are never repaired here: the unchanged comparator rejects drift.
  END LOOP;
END $restore_acl$;`;
}
