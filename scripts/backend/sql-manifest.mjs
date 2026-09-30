const kinds = new Set(['assertion-suite', 'inventory', 'storage-fixture', 'concurrency-setup']);

export function validateSqlManifest(manifest, actualSources, fixtureFiles) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || !manifest.sources.length) {
    throw Error('Invalid SQL matrix manifest.');
  }
  const listed = manifest.sources.map(source => source.file).sort();
  if (JSON.stringify(listed) !== JSON.stringify([...actualSources].sort())) {
    throw Error('Unclassified or duplicate SQL source; update the complete matrix manifest.');
  }
  for (const source of manifest.sources) {
    if (!/^[a-z0-9_]+\.sql$/.test(source.file) || !kinds.has(source.kind) || !Array.isArray(source.fixtures)) {
      throw Error(`Invalid SQL source: ${source.file}`);
    }
    if (source.variables && Object.keys(source.variables).length) {
      throw Error(`Partial execution flags are prohibited: ${source.file}`);
    }
    for (const fixture of source.fixtures) {
      if (!/^supabase\/fixtures\/wave02\/[a-z-]+\.sql$/.test(fixture) || !fixtureFiles.has(fixture)) {
        throw Error(`Invalid or missing synthetic fixture: ${fixture}`);
      }
    }
    if (new Set(source.fixtures).size !== source.fixtures.length) throw Error(`Duplicate fixture: ${source.file}`);
    if (source.kind === 'concurrency-setup' && source.file !== 'clinical_record_amendments_concurrency_setup.sql') {
      throw Error(`Unimplemented concurrency scenario: ${source.file}`);
    }
    if (source.kind === 'inventory' && source.file !== 'security_inventory.sql') throw Error('Unexpected inventory classification.');
    if (source.kind === 'storage-fixture' && source.file !== 'storage_schema_fixture.sql') throw Error('Unexpected storage fixture classification.');
  }
  return manifest;
}
