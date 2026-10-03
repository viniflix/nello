import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import path from 'node:path';
import { publicInformationPaths } from '../src/features/privacy/publicInformationPaths.js';
import { getRouteMetadata } from '../src/app/router/metadataPolicy.js';

export function publicPages() {
  let output;
  let failed = false;
  return { name: 'nello-public-pages', apply: 'build', configResolved(config) { output = path.resolve(config.root, config.build.outDir, 'index.html'); }, buildEnd(error) { failed = Boolean(error); }, async closeBundle() {
    if (failed) return;
    const server = await createServer({ configFile: false, resolve:{alias:{'@':path.resolve('src')}}, plugins: [react()], optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true }, appType: 'custom' });
    try {
      const { default: Landing } = await server.ssrLoadModule('/src/pages/public/LandingPage.jsx');
      const { default: Product } = await server.ssrLoadModule('/src/pages/public/ProductInformationPage.jsx');
      const { default: Legal } = await server.ssrLoadModule('/src/pages/public/LegalInformationPage.jsx');
      const html = await readFile(output, 'utf8');
      const escape = value => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
      for(const pathname of publicInformationPaths) {
        const Component = pathname === '/' ? Landing : ['/recursos','/para-pacientes'].includes(pathname) ? Product : Legal;
        const rendered = renderToStaticMarkup(React.createElement(Component,{pathname}));
        const meta = getRouteMetadata(pathname);
        let page = html.replace('<div id="root"></div>', `<div id="root">${rendered}</div>`)
          .replace(/<title>[^<]*<\/title>/,`<title>${escape(meta.title)}</title>`)
          .replace(/(<meta\b[^>]*\bname="description" content=")[^"]*/,`$1${escape(meta.description)}`)
          .replace(/(<link\b[^>]*\brel="canonical" href=")[^"]*/,`$1${escape(meta.canonical)}`);
        for(const [key,value] of [['og:title',meta.title],['og:description',meta.description],['og:url',meta.canonical],['twitter:title',meta.title],['twitter:description',meta.description]])page=page.replace(new RegExp(`(<meta\\b[^>]*\\b(?:property|name)="${key}" content=")[^"]*`),`$1${escape(value)}`);
        const file = pathname === '/' ? output : path.join(path.dirname(output),pathname.slice(1),'index.html');
        await mkdir(path.dirname(file),{recursive:true});await writeFile(file,page);
      }
    } finally { await server.close(); }
  } };
}
