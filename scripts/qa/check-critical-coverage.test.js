import{it,expect}from'vitest';import{assertCriticalCoverage,criticalFiles}from'./check-critical-coverage.mjs';
const valid=()=>Object.fromEntries(criticalFiles.map(file=>['/workspace/'+file,Object.fromEntries(['lines','statements','functions','branches'].map(key=>[key,{pct:100,total:10}]))]));
it('rejects missing critical domains even when aggregate coverage is perfect',()=>{const report=valid();delete report['/workspace/'+criticalFiles[0]];report.total={lines:{pct:100}};expect(()=>assertCriticalCoverage(report)).toThrow('Missing');});
it('enforces each critical file rather than allowing one domain to compensate for another',()=>{const report=valid();expect(assertCriticalCoverage(report)).toBe(true);report['/workspace/'+criticalFiles[0]].branches.pct=84;expect(()=>assertCriticalCoverage(report)).toThrow('below policy');});
it('accepts genuinely branchless delegates while rejecting absent or empty executable code',()=>{
 const report=valid(),entry=report['/workspace/src/lib/utils/energy-numbers.js'];
 entry.branches={total:0,covered:0,pct:100};expect(assertCriticalCoverage(report)).toBe(true);
 entry.branches.pct=0;expect(()=>assertCriticalCoverage(report)).toThrow('below policy');
 entry.branches.pct=100;entry.functions.total=0;expect(()=>assertCriticalCoverage(report)).toThrow('below policy');
});
