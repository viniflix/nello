import{runDiagnosticCommand}from'./diagnostic-runner.mjs';
const result=await runDiagnosticCommand(['node_modules/vitest/vitest.mjs','run',...process.argv.slice(2)]);
if(result.diagnostics.length)console.error('Actionable React/CSS diagnostics must be repaired:',result.diagnostics);
process.exitCode=result.code;
