import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Hosted/local PostgREST engine versions are provider metadata, not schema types.
// Hosted metadata emits this marker; the pinned local generator omits it.
// All schema contracts, helpers and enum constants must otherwise match.
function canonical(file) {
  const source = readFileSync(file, 'utf8').replace(/PostgrestVersion:\s*"[^"]+"/g, 'PostgrestVersion: "provider-managed"');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw Error(`Invalid generated TypeScript: ${file}`);
  const transformed = ts.transform(ast, [(context) => {
    function visit(node) {
      if (ts.isPropertySignature(node) && node.name.getText(ast) === '__InternalSupabase'
          && ts.isTypeAliasDeclaration(node.parent.parent) && node.parent.parent.name.text === 'Database'
          && ts.isTypeLiteralNode(node.type) && node.type.members.length === 1) {
        const member = node.type.members[0];
        if (ts.isPropertySignature(member) && member.name.getText(ast) === 'PostgrestVersion'
            && ts.isLiteralTypeNode(member.type) && ts.isStringLiteral(member.type.literal)) return undefined;
      }
      // Parentheses around a conditional type differ between hosted/local generators.
      if (ts.isParenthesizedTypeNode(node)) return ts.visitNode(node.type, visit);
      return ts.visitEachChild(node, visit, context);
    }
    return (node) => ts.visitNode(node, visit);
  }]);
  try {
    return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(transformed.transformed[0]);
  } finally { transformed.dispose(); }
}
if (canonical(process.argv[2]) !== canonical(process.argv[3])) {
  console.error('Database types drift: regenerate from the reconciled schema and review contracts.');
  process.exitCode = 1;
} else console.log('Generated database types match the reconciled schema.');
