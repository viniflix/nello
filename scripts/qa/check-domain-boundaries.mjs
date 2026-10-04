import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const isTest = path => /\.(?:test|spec)\.[jt]sx?$/.test(path) || path.includes('/__tests__/');
const isUi = path => /^src\/(?:components|pages|contexts|hooks|portals)\//.test(path) || /src\/features\/[^/]+\/(?:components|hooks)\//.test(path);
const clientImport = value => /(?:supabase\/(?:client|domainClients)|customSupabaseClient|@supabase\/supabase-js)$/.test(value);
export function inspectSource(path, content) {
  const ast = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = [], forbidden = [];
  let calls = 0;
  const visit = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (clientImport(specifier)) imports.push(node.getText(ast).replace(/\s+/g, ' '));
      if (path.startsWith('src/domain/') && !node.importClause?.isTypeOnly
        && specifier !== 'zod' && !specifier.startsWith('.') ) forbidden.push('external_dependency');
      if (path.startsWith('src/domain/') && specifier.startsWith('.')
        && !resolve(path, '..', specifier).startsWith(resolve('src/domain'))
        && specifier !== '../../../supabase/functions/_shared/clinical-arithmetic.js') forbidden.push('outside_domain');
    }
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && ['from', 'rpc', 'channel', 'createClient'].includes(node.expression.name.text)
        && !(ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Array')) calls += 1;
      if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && clientImport(node.arguments[0].text)) forbidden.push('dynamic_client_import');
    }
    if (path.startsWith('src/domain/') && ts.isIdentifier(node)
      && ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'fetch', 'process'].includes(node.text)) forbidden.push('platform_dependency');
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'serviceWorker') forbidden.push('unapproved_service_worker');
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return { imports: imports.sort(), calls, forbidden };
}
export function checkDomainBoundaries(sources, baseline) {
  const errors = [];
  for (const { path, content } of sources.filter(source => !isTest(source.path))) {
    const result = inspectSource(path, content);
    if (content.includes('@/lib/customSupabaseClient')) errors.push(`Legacy client import: ${path}`);
    if (result.forbidden.length) errors.push(`Forbidden boundary in ${path}: ${[...new Set(result.forbidden)].join(',')}`);
    if (isUi(path)) {
      const allowed = baseline[path] || { imports: [], calls: 0 };
      if (result.calls > allowed.calls || result.imports.some(value => !allowed.imports.includes(value))) errors.push(`New direct database access in UI: ${path}`);
    }
  }
  return errors;
}
function run() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split(/\r?\n/).filter(path => /^src\/.+\.[jt]sx?$/.test(path));
  const sources = files.map(path => ({ path, content: readFileSync(path, 'utf8') }));
  const baselinePath = 'operations/architecture/ui-database-baseline.json';
  if (process.argv.includes('--record-baseline')) {
    const baseline = Object.fromEntries(sources.filter(source => isUi(source.path) && !isTest(source.path)).map(({path, content}) => [path, inspectSource(path, content)]).filter(([,result]) => result.imports.length || result.calls));
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2)+'\n');
    return;
  }
  const errors = checkDomainBoundaries(sources, JSON.parse(readFileSync(baselinePath, 'utf8')));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Domain boundaries passed; no new direct UI database access or platform dependency.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
