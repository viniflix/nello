/** Load runtime schemas at mutation time, keeping the login/bootstrap bundle bounded. */
export async function executeDomainOperation(transport, request) {
  const { executeOperation } = await import('@/domain/api');
  return executeOperation(transport, request);
}
