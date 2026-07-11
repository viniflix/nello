import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REQUIRED_PATHS = ['src', 'public', 'package.json'];
const TEMPORARY_ROOT_FILE = /^(scratch|temp|tmp)[-_].+\.(?:js|mjs|cjs|ts)$/i;
const LEGACY_SERVICE_ALLOWLIST = new Set(['src/services/adminService.js']);

export function checkProjectStructure(rootDir, trackedFiles, sourceFiles = []) {
  const errors = [];

  for (const requiredPath of REQUIRED_PATHS) {
    if (!existsSync(resolve(rootDir, requiredPath))) {
      errors.push(`Required path is missing: ${requiredPath}`);
    }
  }

  for (const file of trackedFiles.map((value) => value.replaceAll('\\', '/'))) {
    const isSqlMigration = file.endsWith('.sql')
      && (file.includes('/migrations/') || /(^|\/)\w*migration\w*\.sql$/i.test(file));

    if (file.startsWith('dist/')) {
      errors.push(`Generated build output must not be tracked: ${file}`);
    } else if (!file.includes('/') && TEMPORARY_ROOT_FILE.test(file)) {
      errors.push(`Temporary root file must not be tracked: ${file}`);
    } else if (file.startsWith('src/services/') && !LEGACY_SERVICE_ALLOWLIST.has(file)) {
      errors.push(`Generic service has no domain owner: ${file}`);
    } else if (isSqlMigration && !file.startsWith('supabase/migrations/')) {
      errors.push(`SQL migration must live in supabase/migrations: ${file}`);
    }
  }

  for (const sourceFile of sourceFiles) {
    if (sourceFile.content.includes("@/analytics/posthog")) {
      errors.push(
        `Legacy analytics import is not allowed in ${sourceFile.path}; use @/infrastructure/analytics/posthog`,
      );
    }
  }

  return { errors };
}

function runCli() {
  const rootDir = process.cwd();
  const output = execFileSync('git', ['ls-files'], { cwd: rootDir, encoding: 'utf8' });
  const trackedFiles = output.split(/\r?\n/).filter(Boolean);
  const sourceFiles = trackedFiles
    .filter((file) => /^src\/.+\.(?:js|jsx|ts|tsx)$/.test(file))
    .map((file) => ({
      path: file,
      content: readFileSync(resolve(rootDir, file), 'utf8'),
    }));
  const result = checkProjectStructure(rootDir, trackedFiles, sourceFiles);

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
