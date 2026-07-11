import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { evaluateBundle } from '../../build/bundleBudget.js';

const distDirectory = path.resolve('dist');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath);

    const details = await stat(absolutePath);
    return [{
      path: path.relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
      size: details.size,
    }];
  }));

  return nested.flat();
}

try {
  const violations = evaluateBundle(await listFiles(distDirectory));
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Bundle budget passed.');
  }
} catch (error) {
  console.error(`Unable to inspect dist: ${error.message}`);
  process.exitCode = 1;
}
