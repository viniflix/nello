import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const source = '.qa-licenses/THIRD_PARTY_NOTICES.txt';
if (!existsSync('dist/index.html') || !existsSync(source)) throw new Error('Build and license inventory required before publishing notices');
const text = readFileSync(source, 'utf8');
if (!text.includes('react@') || !text.includes('Permission is hereby granted')) throw new Error('Incomplete dependency attribution');
writeFileSync('dist/third-party-notices.txt', `${text}\n\n${readFileSync('THIRD_PARTY_NOTICES.md', 'utf8')}`);
console.log('Third-party notices included in the public build.');
