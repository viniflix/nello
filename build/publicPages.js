import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import path from 'node:path';

export function publicPages() {
  let output;
  let failed = false;
  return { name: 'nello-public-pages', apply: 'build', configResolved(config) { output = path.resolve(config.root, config.build.outDir, 'index.html'); }, buildEnd(error) { failed = Boolean(error); }, async closeBundle() {
    if (failed) return;
    const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true }, appType: 'custom' });
    try {
      const { default: Landing } = await server.ssrLoadModule('/src/pages/public/LandingPage.jsx');
      const html = await readFile(output, 'utf8');
      const rendered = renderToStaticMarkup(React.createElement(Landing));
      await writeFile(output, html.replace('<div id="root"></div>', `<div id="root">${rendered}</div>`));
    } finally { await server.close(); }
  } };
}
