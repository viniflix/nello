import {readFileSync} from 'node:fs';
import {checkToolingMaintenance} from './tooling-maintenance-policy.mjs';
const pkg=JSON.parse(readFileSync('package.json')),lock=JSON.parse(readFileSync('package-lock.json'));
console.log('Maintenance conditions remain open:', checkToolingMaintenance(pkg, JSON.parse(readFileSync('operations/tooling-maintenance-policy.json'))));
if(pkg.engines.node!=='22.x'||pkg.engines.npm!=='11.21.x'||pkg.packageManager!=='npm@11.21.0')throw Error('Runtime policy drift');
if(readFileSync('.nvmrc','utf8').trim()!=='22.23.3')throw Error('Local/CI Node baseline drift');
for(const section of ['dependencies','devDependencies'])for(const [name,version] of Object.entries(pkg[section]||{})){
 if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)||lock.packages[''][section]?.[name]!==version||lock.packages[`node_modules/${name}`]?.version!==version)throw Error(`Direct dependency must be reviewed and locked: ${name}`);
}
console.log('Exact direct dependencies and Node/npm baseline policy passed.');
