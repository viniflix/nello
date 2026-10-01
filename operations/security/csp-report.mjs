const directives = new Set(['script-src','script-src-elem','script-src-attr','style-src','style-src-elem','style-src-attr','connect-src','img-src','font-src','media-src','worker-src','frame-src','object-src','default-src','form-action','base-uri']);
// A positive schema intentionally discards URLs, source code, line numbers,
// referrers, identifiers, samples and arbitrary text supplied by reporters.
export function sanitizeCspReport(input) {
  const reports = Array.isArray(input) ? input.slice(0, 10).map(item => item?.body) : [input?.['csp-report']];
  return reports.flatMap(report => {
    if (!report || typeof report !== 'object') return [];
    const directive = report['effective-directive'] || report.effectiveDirective;
    if (!directives.has(directive)) return [];
    const blocked = report['blocked-uri'] || report.blockedURL;
    const category = blocked === 'inline' ? 'inline' : blocked === 'eval' ? 'eval'
      : typeof blocked === 'string' && blocked.startsWith('data:') ? 'data'
      : typeof blocked === 'string' && blocked.startsWith('blob:') ? 'blob' : 'url';
    return [{ directive, category, disposition: report.disposition === 'report' ? 'report' : 'enforce' }];
  });
}
