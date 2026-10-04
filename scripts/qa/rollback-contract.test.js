import { it, expect } from 'vitest';
import { assertRollbackEndpoint, assertRollbackTemplate, exerciseFunctionRollback } from './rollback-contract.mjs';
it('accepts only the independently verified, named disposable template', () => {
  const result = { applicationCatalogMatched: true, productionData: false, database: 'nello_qa_wave02_template' };
  expect(() => assertRollbackTemplate(result)).not.toThrow();
  expect(() => assertRollbackTemplate({ ...result, database: 'postgres' })).toThrow('template');
  expect(() => assertRollbackTemplate({ ...result, productionData: true })).toThrow('template');
  expect(() => assertRollbackTemplate({ ...result, applicationCatalogMatched: false })).toThrow('template');
});
it.each(['https://nellonutri.com.br', 'https://production.supabase.co', 'http://localhost:54322', 'http://127.0.0.2:54321'])('refuses rollback outside the registered QA endpoint: %s', origin => {
  expect(() => assertRollbackEndpoint(origin)).toThrow('disposable');
});
it('installs, detects and restores distinct function versions', async () => {
  const installed = []; let current;
  expect(await exerciseFunctionRollback({ install: async version => { installed.push(version); current = version; }, read: async () => current }))
    .toMatchObject({ baselineVerified: true, incompatibleVersionDetected: true, restoredVersionVerified: true });
  expect(installed).toEqual([1, 2, 1]);
});
it('rejects a worker cache that keeps returning the old version', async () => {
  await expect(exerciseFunctionRollback({ install: async () => {}, read: async () => 1 })).rejects.toThrow('actually loaded');
});
it('rejects a rollback whose restored endpoint still returns the incompatible version', async () => {
  let installs = 0;
  await expect(exerciseFunctionRollback({ install: async () => { installs++; }, read: async () => installs === 1 ? 1 : 2 })).rejects.toThrow('Restored');
});
