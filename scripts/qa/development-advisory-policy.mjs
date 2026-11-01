export function checkDevelopmentAdvisories(audit, lock, policy, now = new Date()) {
  if (audit?.auditReportVersion !== 2 || !audit.vulnerabilities || !audit.metadata?.vulnerabilities) {
    throw new Error('Complete npm audit report required');
  }
  const findings = Object.values(audit.vulnerabilities);
  const counts = audit.metadata.vulnerabilities;
  if (audit.error || counts.total !== findings.length || ['info', 'low', 'moderate', 'high', 'critical'].some(
    severity => counts[severity] !== findings.filter(finding => finding.severity === severity).length,
  )) throw new Error('Complete npm audit counts required');
  const reviewed = [];
  for (const finding of findings) {
    const allowed = policy.packages[finding.name];
    if (!allowed || finding.severity !== allowed.severity) throw new Error(`Unreviewed dependency risk: ${finding.name}`);
    if (now >= new Date(policy.reviewBy) || !Number.isFinite(new Date(policy.reviewBy).getTime())) {
      throw new Error('Development advisory review expired');
    }
    const paths = [...finding.nodes].sort();
    if (JSON.stringify(paths) !== JSON.stringify(Object.keys(allowed.nodes).sort())) {
      throw new Error(`Dependency risk path changed: ${finding.name}`);
    }
    for (const path of paths) {
      const pkg = lock.packages[path];
      if (pkg?.dev !== true || pkg.version !== allowed.nodes[path]) {
        throw new Error(`Dependency risk entered runtime or changed version: ${finding.name}`);
      }
    }
    const causes = finding.via.map(cause => typeof cause === 'string' ? cause : cause.url).sort();
    // npm versions may omit redundant inherited edges; every reported edge must still be reviewed.
    if (causes.some(cause => !allowed.via.includes(cause))) {
      throw new Error(`Dependency advisory cause changed: ${finding.name}`);
    }
    // Follow every inherited warning to the one reviewed advisory, not a blanket package exception.
    const walk = (name, parents = new Set()) => {
      if (parents.has(name)) return false;
      const item = audit.vulnerabilities[name];
      if (!item || !policy.packages[name] || !item.via.length) throw new Error('Incomplete advisory chain');
      let reachesReviewedAdvisory = false;
      for (const cause of item.via) {
        if (typeof cause === 'string') {
          const reachesRoot = walk(cause, new Set([...parents, name]));
          reachesReviewedAdvisory = reachesRoot || reachesReviewedAdvisory;
        } else {
          if (cause.url !== policy.advisory) throw new Error('Unreviewed advisory in inherited chain');
          reachesReviewedAdvisory = true;
        }
      }
      return reachesReviewedAdvisory;
    };
    if (!walk(finding.name)) throw new Error('Cyclic advisory chain');
    reviewed.push(finding.name);
  }
  return { reviewedDevelopmentWarnings: reviewed.sort(), reviewBy: policy.reviewBy,
    completeAuditClear: findings.length === 0, upstreamPatchVerified: false };
}
