import { readFile, readdir, stat } from 'node:fs/promises';
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
  const html = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
  const entryScripts = [...html.matchAll(/<script\b[^>]*\bsrc="(\/assets\/[^"?]+\.js)"/g)]
    .map((match) => `dist${match[1]}`);
  if (entryScripts.length === 0) throw new Error('No entry JavaScript found in index.html');
  const violations = evaluateBundle(await listFiles(distDirectory), entryScripts);
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
