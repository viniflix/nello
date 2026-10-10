import{runDiagnosticCommand}from'./diagnostic-runner.mjs';
const pool=process.env.NELLO_TEST_POOL;
if(pool && !['forks','threads'].includes(pool))throw Error('NELLO_TEST_POOL must be forks or threads');
const workers=process.env.NELLO_TEST_MAX_WORKERS;
if(workers && !/^[1-4]$/.test(workers))throw Error('NELLO_TEST_MAX_WORKERS must be between 1 and 4');
const result=await runDiagnosticCommand(['node_modules/vitest/vitest.mjs','run',...(pool?['--pool',pool]:[]),...(workers?['--maxWorkers',workers]:[]),...process.argv.slice(2)]);
if(result.diagnostics.length)console.error('Actionable React/CSS diagnostics must be repaired:',result.diagnostics);
process.exitCode=result.code;
