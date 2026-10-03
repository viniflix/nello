import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicInformationPaths } from '../../src/features/privacy/publicInformationPaths.js';

export function applicationRewrites(root = '.') {
  const files = ['authRoutes.jsx', 'nutritionistRoutes.jsx', 'patientRoutes.jsx', 'adminRoutes.jsx', 'index.jsx'];
  const paths = [...new Set(files.flatMap(file => [...readFileSync(resolve(root, 'src/app/router', file), 'utf8')
    .matchAll(/path="([^"]+)"/g)].map(match => match[1])))].filter(route => route !== '*');
  paths.push('/status', ...publicInformationPaths.filter(path => path !== '/'));
  return paths.map(source => ({ source, destination: publicInformationPaths.includes(source) && source !== '/' ? `${source}/index.html` : '/index.html' }));
}

export function matchesApplicationPath(pathname, rewrites) {
  return rewrites.some(({ source }) => {
    const pattern = source.replace(/\/:\w+\?/g, '(?:/[^/]+)?').replace(/:\w+/g, '[^/]+');
    return new RegExp(`^${pattern}/?$`).test(pathname);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const rewrites = applicationRewrites();
  if (process.argv.includes('--write')) {
    config.rewrites = rewrites;
    writeFileSync('vercel.json', `${JSON.stringify(config, null, 2)}\n`);
  } else if (JSON.stringify(config.rewrites) !== JSON.stringify(rewrites)) {
    throw Error('Application routes and deployment rewrites differ. Run node scripts/availability/routes.mjs --write.');
  }
  console.log(`${rewrites.length} application routes verified; unknown paths, API and static resources do not use SPA fallback.`);
}
