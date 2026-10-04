export function assertRollbackEndpoint(origin) {
  if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(new URL(origin).origin)) throw Error('Only the registered disposable rollback endpoint is allowed');
}

export function assertRollbackTemplate(restoration) {
  if (restoration?.applicationCatalogMatched !== true || restoration.productionData !== false
    || restoration.database !== 'nello_qa_wave02_template') throw Error('Verified isolated restoration template required');
}

export function rollbackFunctionSource(version) {
  if (![1,2].includes(version)) throw Error('Unsupported synthetic function version');
  return `Deno.serve(() => Response.json({ version: ${version} }));\n`;
}

export async function exerciseFunctionRollback({ install, read }) {
  await install(1);
  if (await read() !== 1) throw Error('Baseline function contract unavailable');
  await install(2);
  if (await read() !== 2) throw Error('Candidate function was not actually loaded');
  await install(1);
  if (await read() !== 1) throw Error('Restored function contract unavailable');
  return { baselineVerified: true, incompatibleVersionDetected: true, restoredVersionVerified: true };
}
