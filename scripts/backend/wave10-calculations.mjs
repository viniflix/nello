import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {assertIsolatedRuntime} from '../qa/isolated-runtime.mjs';
import {candidateMigrations} from './candidate-migrations.mjs';
assertIsolatedRuntime();
const db='nello_qa_wave02_1000010';
const sql=(target,input)=>execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d',target,'-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
const fixture=JSON.parse(readFileSync('src/lib/utils/__fixtures__/energy-independent-reference.json','utf8'));
let created=false;const output='.backend-ci/wave10-results';mkdirSync(output,{recursive:true});
try {
 sql('postgres',`CREATE DATABASE ${db} TEMPLATE nello_qa_wave02_template OWNER supabase_admin;`);created=true;
 for(const candidate of candidateMigrations())sql(db,candidate.content);
 sql(db,readFileSync('supabase/tests/wave10_clinical_calculation_contract.sql','utf8'));
 const query=fixture.cases.map(({method,inputs,expected})=>{
  const data={weight_kg:inputs.weight,height_cm:inputs.height,age_years:inputs.age,sex:inputs.gender,lean_mass_kg:inputs.leanMass,activity_factor:1,clinical_mobility:'bedridden',mobility_factor:1.2,injury_factor:1,injury_factor_id:'none',dri_activity:inputs.driActivity,life_stage:'adult'};
  const key=['eer_iom','dri_2023'].includes(method)?'get':'tmb';
  return `SELECT (private.wave10_energy_reference('${method}',$input$${JSON.stringify(data)}$input$)->>'${key}')::numeric = ${expected}::numeric;`;
 }).join('\n');
 const results=sql(db,query).trim().split(/\r?\n/);assert.equal(results.length,208);assert(results.every(result=>result==='t'));
 writeFileSync(output+'/mathematics.json',JSON.stringify({passed:true,productionData:false,independentCases:results.length,capturedAt:new Date().toISOString()},null,2));
 console.log('PASS: 208 independent Decimal references match PostgreSQL NUMERIC; invalid factors, age and private execution rejected.');
} finally {if(created)sql('postgres',`DROP DATABASE ${db};`);}
