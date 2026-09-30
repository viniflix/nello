import { describe, expect, it } from 'vitest';
import { defaultOwnerAclSql } from './restore-acl.mjs';
const relation = { schema: 'private', name: 'admin_operators', kind: 'r', owner: 'postgres', grants: '{postgres=arwdDxtm/postgres}' };
const build = (relations) => defaultOwnerAclSql({ relations }, 'nello_qa_wave02_template');
describe('restore explicit default owner ACL without relaxing catalog comparison', () => {
  it('materializes only a verified PostgreSQL default in the disposable clone', () => {
    const sql = build([relation]);
    expect(sql).toContain('admin_operators');
    expect(sql).toContain("current_database() <> 'nello_qa_wave02_template'");
    expect(sql).toContain("current_user <> 'postgres'");
    expect(sql).toContain('IF actual.relacl IS NULL THEN');
    expect(sql).toContain('actual.default_acl <> expected.grants');
    expect(sql).toContain('INTO STRICT');
    expect(sql).toContain('GRANT ALL PRIVILEGES ON TABLE %I.%I TO %I');
  });
  it.each([
    { grants: null }, { grants: '{}' }, { grants: '{postgres=arwdDxt/postgres}' },
    { grants: '{postgres=arwdDxtm/postgres,anon=r/postgres}' },
    { grants: '{postgres=a*rwdDxtm/postgres}' }, { grants: '{postgres=arwdDxtm/other}' },
    { kind: 'S' }, { kind: 'v' }, { schema: 'storage' }, { owner: 'other' },
  ])('does not conceal a changed grant, grantor, grant option, owner or object kind: %j', (change) => {
    expect(build([{ ...relation, ...change }])).not.toContain('admin_operators');
  });
  it('quotes source metadata safely and rejects any other destination', () => {
    expect(build([{ ...relation, name: "patient's\"table" }])).toContain("patient''s");
    expect(() => defaultOwnerAclSql({ relations: [relation] }, 'postgres')).toThrow('isolated');
  });
});
