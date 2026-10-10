export function checkToolingMaintenance(pkg, policy, now = new Date()) {
  if (policy?.schemaVersion !== 1 || !policy.packages || !Object.keys(policy.packages).length) {
    throw new Error('Complete tooling maintenance review required');
  }
  const deadline = new Date(policy.reviewBy);
  if (!Number.isFinite(deadline.getTime()) || now >= deadline) throw new Error('Tooling maintenance review expired');
  for (const [name, finding] of Object.entries(policy.packages)) {
    const version = pkg.dependencies?.[name] || pkg.devDependencies?.[name];
    if (version !== finding.version || !['end_of_life', 'repository_archived'].includes(finding.status) || !finding.reason || !finding.source) {
      throw new Error(`Tooling maintenance review changed: ${name}`);
    }
  }
  return { pending: Object.keys(policy.packages), reviewBy: policy.reviewBy, supportedToolingCertified: false };
}
