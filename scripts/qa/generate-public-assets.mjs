import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const logo = `data:image/png;base64,${readFileSync('public/nello-logo.png').toString('base64')}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:#edeced;display:grid;place-items:center;height:100vh"><img src="${logo}" style="width:72%;height:60%;object-fit:contain" alt="Nello"></body></html>`);
    await page.screenshot({ path: `public/${size === 180 ? 'apple-touch-icon' : 'icon-' + size}.png` });
  }
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<html lang="pt-BR"><body style="margin:0;box-sizing:border-box;padding:72px;background:#edeced;color:#44403c;font-family:Arial,sans-serif;height:630px;display:flex;flex-direction:column;justify-content:space-between"><img src="${logo}" alt="Nello" style="width:200px;height:85px;object-fit:contain;object-position:left"><div><h1 style="font-size:64px;line-height:1.1;margin:0 0 24px;max-width:950px">Mais clareza para cuidar.<br>Mais tempo para acompanhar.</h1><p style="font-size:28px;line-height:1.5;margin:0">Pacientes, avaliações e planos alimentares em um só lugar.</p></div><p style="font-size:24px;color:#4b6b38;margin:0">nellonutri.com.br · Nutrição clínica · Beta</p></body></html>`);
  await page.screenshot({ path: 'public/og-image.png' });
} finally { await browser.close(); }
