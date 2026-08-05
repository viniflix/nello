import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
const spaRewrite = config.rewrites.find((rewrite) => rewrite.destination === '/index.html');
const rewritePattern = new RegExp(`^${spaRewrite.source}$`);

describe('roteamento da SPA na Vercel', () => {
  it('mantém deep links do aplicativo no index.html', () => {
    expect(rewritePattern.test('/nutritionist/patients/example/meal-plan')).toBe(true);
    expect(rewritePattern.test('/patient/registros-clinicos')).toBe(true);
  });

  it('não transforma chunks ausentes em HTML', () => {
    expect(rewritePattern.test('/assets/MealPlanPage-old.js')).toBe(false);
    expect(rewritePattern.test('/assets/index-old.css')).toBe(false);
  });
});
