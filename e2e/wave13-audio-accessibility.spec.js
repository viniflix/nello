import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

test('media dialog contains keyboard focus, closes with Escape and restores its trigger', async ({ page }) => {
  await page.setViewportSize({width:320,height:480});
  await page.route('**/__qa__/media.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><head><title>Mídia sintética</title></head><body><div id="root"></div></body></html>'}));
  await page.goto('/__qa__/media.html');
  await page.evaluate(async()=>{const {mountSyntheticMediaModal}=await import('/__qa__/harness.js');mountSyntheticMediaModal();});
  const trigger=page.getByRole('button',{name:'Ampliar imagem'});await trigger.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Visualizar imagem'});await expect(dialog).toBeVisible();
  await expect(page.getByRole('button',{name:'Fechar',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Fechar',exact:true})).toBeFocused();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
});

test.beforeAll(() => {
  mkdirSync('.backend-ci/qa-assets', { recursive: true });
  // PCM silence is fully seekable even on the disposable static HTTP server.
  const bytes = 8000 * 2 * 3;
  const wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + bytes, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(bytes, 40);
  writeFileSync('.backend-ci/qa-assets/synthetic-audio.wav', wav);
});

for (const width of [320, 390, 768, 1440]) test(`chat audio keyboard, axe and layout at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 768 ? 480 : 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // A blank local document avoids Auth and all production network resources.
  await page.route('**/__qa__/audio.html', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="pt-BR"><head><title>Áudio sintético</title></head><body><div id="root"></div></body></html>' }));
  await page.goto('/__qa__/audio.html');
  await page.evaluate(async () => {
    const { mountSyntheticAudio } = await import('/__qa__/harness.js');
    const audio = await (await fetch('/__qa__/synthetic-audio.wav')).blob();
    mountSyntheticAudio(URL.createObjectURL(audio));
  });
  const { readdirSync } = await import('node:fs');
  const css = readdirSync('dist/assets').filter(file => file.endsWith('.css'));
  for (const file of css) await page.addStyleTag({ url: `/assets/${file}` });
  const slider = page.getByRole('slider', { name: 'Posição do áudio' });
  await expect(slider).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reproduzir áudio' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(slider).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0);
  await expect.poll(async () => Math.abs(await page.locator('audio').evaluate(audio => audio.currentTime) - Number(await slider.inputValue()))).toBeLessThan(0.00001);
  await page.keyboard.press('End');
  const max = Number(await slider.getAttribute('max'));
  await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(max, 5);
  await page.keyboard.press('Home'); await expect(slider).toHaveValue('0');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const buttonBounds = await page.getByRole('button', { name: 'Reproduzir áudio' }).boundingBox();
  expect(buttonBounds.width).toBeGreaterThanOrEqual(44); expect(buttonBounds.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('main')).toHaveScreenshot(`wave13-audio-${width}.png`);
  expect(errors).toEqual([]);
});

test('audio failed loading remains recoverable with a safe accessible message', async ({ page }) => {
  await page.route('**/__qa__/audio.html', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="pt-BR"><head><title>Áudio sintético</title></head><body><div id="root"></div></body></html>' }));
  await page.goto('/__qa__/audio.html');
  await page.evaluate(async () => (await import('/__qa__/harness.js')).mountSyntheticAudio('/__qa__/missing.ogg'));
  await expect(page.getByRole('alert')).toHaveText('Não foi possível reproduzir o áudio. Tente novamente.');
  await expect(page.getByRole('button', { name: 'Reproduzir áudio' })).toBeEnabled();
  await expect(page.getByRole('slider')).toBeDisabled();
});
