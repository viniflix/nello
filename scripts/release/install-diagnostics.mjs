// Print only structured npm diagnostics. Never dump the environment or raw log.
export function summarizeNpmLog(log) {
  const rows = log.split(/\r?\n/);
  const summary = { versions: [], failures: [], requests: [], lifecycle: [], unfinished: [] };
  for (const row of rows) {
    const version = row.match(/info using (npm|node)@v?(\d+\.\d+\.\d+)/);
    if (version) summary.versions.push(`${version[1]}@${version[2]}`);
    const code = row.match(/(?:error code|error errno) ([A-Z][A-Z0-9_]+|-[0-9]+)\s*$/);
    if (code) summary.failures.push(code[1]);
    if (row.includes('Exit handler never called!')) summary.failures.push('Exit handler never called');
    const request = row.match(/http fetch (GET|POST|PUT) ([0-9]{3}) (https?:\/\/\S+) ([0-9]+ms)/);
    if (request) {
      try {
        const url = new URL(request[3]);
        // No credentials, query strings, fragments, or private registry paths.
        summary.requests.push({ method: request[1], status: Number(request[2]),
          host: url.hostname, packagePath: url.hostname === 'registry.npmjs.org' ? url.pathname : '[redacted]', duration: request[4] });
      } catch { /* Malformed URL is not safe to print. */ }
    }
    const run = row.match(/info run ([@a-zA-Z0-9_./-]+@[0-9][a-zA-Z0-9.+-]*) ([a-zA-Z]+) (?:node_modules\/[^ ]+ )?\{ code: (null|[0-9]+), signal: (null|'[A-Z0-9]+') \}/);
    if (run) summary.lifecycle.push({ package: run[1], script: run[2], code: run[3], signal: run[4] });
    const timer = row.match(/(?:silly|verbose) unfinished npm timer ([a-zA-Z0-9:@_./-]+) [0-9]+\s*$/);
    if (timer) summary.unfinished.push(timer[1]);
  }
  return { ...summary, versions: [...new Set(summary.versions)], failures: [...new Set(summary.failures)], requests: summary.requests.slice(-25), lifecycle: summary.lifecycle.slice(-20), unfinished: summary.unfinished.slice(-30) };
}
