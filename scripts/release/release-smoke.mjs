import { smokeDeployment } from './smoke.mjs';
import { smokeAvailability } from '../availability/smoke.mjs';

export function createReleaseSmoke(options = {}) {
  return async (base, { stage } = {}) => {
    const deployment = await smokeDeployment(base, options);
    // Rollback targets may predate the health endpoint. Every new candidate and
    // post-promotion observation must satisfy the expanded availability contract.
    if (!['rollback-target', 'rollback'].includes(stage)) await smokeAvailability(base, options);
    return deployment;
  };
}
