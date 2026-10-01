import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
const rewritePatterns = config.rewrites.filter(rewrite => rewrite.destination === '/index.html')
  .map(rewrite => new RegExp(`^${rewrite.source.replace(/\/:\w+\?/g, '(?:/[^/]+)?').replace(/:\w+/g, '[^/]+')}/?$`));
const rewritePattern = { test: path => rewritePatterns.some(pattern => pattern.test(path)) };
const catchAllHeaders = config.headers.find((entry) => entry.source === '/(.*)')?.headers || [];
const contentSecurityPolicy = catchAllHeaders.find((header) => header.key === 'Content-Security-Policy')?.value || '';

describe('roteamento da SPA na Vercel', () => {
  it('mantém deep links do aplicativo no index.html', () => {
    expect(rewritePattern.test('/nutritionist/patients/example/meal-plan')).toBe(true);
    expect(rewritePattern.test('/patient/registros-clinicos')).toBe(true);
  });

  it('não transforma chunks ausentes em HTML', () => {
    expect(rewritePattern.test('/assets/MealPlanPage-old.js')).toBe(false);
    expect(rewritePattern.test('/assets/index-old.css')).toBe(false);
    expect(rewritePattern.test('/api/health')).toBe(false);
    expect(rewritePattern.test('/api/missing')).toBe(false);
    expect(rewritePattern.test('/pagina-que-nao-existe')).toBe(false);
    expect(rewritePattern.test('/patient/rota-inexistente')).toBe(false);
    expect(rewritePattern.test('/robots.txt')).toBe(false);
  });
});

describe('headers de segurança da produção', () => {
  it('overrides the platform static wildcard with only the application origin', () => {
    expect(catchAllHeaders.find(header => header.key === 'Access-Control-Allow-Origin')?.value).toBe('https://nellonutri.com.br');
  });
  it('bloqueia JavaScript dinâmico e script inline, preservando WebAssembly usado nos PDFs', () => {
    expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy).toContain("'wasm-unsafe-eval'");
    expect(contentSecurityPolicy.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
  });

  it('restringe base, formulários e enquadramento da aplicação', () => {
    expect(contentSecurityPolicy).toContain("base-uri 'self'");
    expect(contentSecurityPolicy).toContain("form-action 'self'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain('upgrade-insecure-requests');
  });
});
