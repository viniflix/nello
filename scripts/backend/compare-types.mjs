import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Hosted/local PostgREST engine versions are provider metadata, not schema types.
// The full generated Database, helpers and enum constants must otherwise match.
function canonical(file) {
  const source = readFileSync(file, 'utf8').replace(/PostgrestVersion:\s*"[^"]+"/g, 'PostgrestVersion: "provider-managed"');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw Error(`Invalid generated TypeScript: ${file}`);
  return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(ast);
}
if (canonical(process.argv[2]) !== canonical(process.argv[3])) {
  console.error('Database types drift: regenerate from the reconciled schema and review contracts.');
  process.exitCode = 1;
} else console.log('Generated database types match the reconciled schema.');
