import { describe, expect, it } from 'vitest';
import { evaluateBundle } from './bundleBudget';

describe('evaluateBundle', () => {
  it('reports oversized JavaScript chunks and source maps', () => {
    const result = evaluateBundle([
      { path: 'dist/assets/main.js', size: 1_600_001 },
      { path: 'dist/assets/main.js.map', size: 20 },
      { path: 'dist/assets/styles.css', size: 200_000 },
    ]);

    expect(result).toEqual([
      'dist/assets/main.js exceeds the 1600000 byte JavaScript chunk budget (1600001 bytes)',
      'dist/assets/main.js.map must not be published',
    ]);
  });

  it('accepts the current production limits', () => {
    expect(evaluateBundle([
      { path: 'dist/assets/pdf.js', size: 1_478_667 },
      { path: 'dist/assets/main.js', size: 995_348 },
    ])).toEqual([]);
  });
});
