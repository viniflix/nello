import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REQUIRED_PATHS = ['src', 'public', 'package.json'];
const TEMPORARY_ROOT_FILE = /^(scratch|temp|tmp)[-_].+\.(?:js|mjs|cjs|ts)$/i;

export function checkProjectStructure(rootDir, trackedFiles) {
  const errors = [];

  for (const requiredPath of REQUIRED_PATHS) {
    if (!existsSync(resolve(rootDir, requiredPath))) {
      errors.push(`Required path is missing: ${requiredPath}`);
    }
  }

  for (const file of trackedFiles.map((value) => value.replaceAll('\\', '/'))) {
    if (file.startsWith('dist/')) {
      errors.push(`Generated build output must not be tracked: ${file}`);
    } else if (!file.includes('/') && TEMPORARY_ROOT_FILE.test(file)) {
      errors.push(`Temporary root file must not be tracked: ${file}`);
    }
  }

  return { errors };
}

function runCli() {
  const rootDir = process.cwd();
  const output = execFileSync('git', ['ls-files'], { cwd: rootDir, encoding: 'utf8' });
  const trackedFiles = output.split(/\r?\n/).filter(Boolean);
  const result = checkProjectStructure(rootDir, trackedFiles);

  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
    return;
  }

  console.log('Project structure checks passed.');
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';
if (currentFile === invokedFile) runCli();
