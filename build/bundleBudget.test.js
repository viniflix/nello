import { describe, expect, it } from 'vitest';
import { evaluateBundle } from './bundleBudget';

describe('evaluateBundle', () => {
  it('reports oversized JavaScript chunks and source maps', () => {
    const result = evaluateBundle([
      { path: 'dist/assets/main.js', size: 1_100_001 },
      { path: 'dist/assets/main.js.map', size: 20 },
      { path: 'dist/assets/styles.css', size: 200_000 },
    ]);

    expect(result).toEqual([
      'dist/assets/main.js exceeds the 1100000 byte JavaScript chunk budget (1100001 bytes)',
      'dist/assets/main.js.map must not be published',
    ]);
  });

  it('accepts the current production limits', () => {
    expect(evaluateBundle([
      { path: 'dist/assets/pdf.js', size: 1_050_000 },
      { path: 'dist/assets/main.js', size: 735_000 },
    ])).toEqual([]);
  });

  it('enforces a tighter budget for the initial script', () => {
    expect(evaluateBundle([
      { path: 'dist/assets/index-abc.js', size: 800_001 },
    ], ['dist/assets/index-abc.js'])).toEqual([
      'dist/assets/index-abc.js exceeds the 800000 byte entry JavaScript budget (800001 bytes)',
    ]);
  });
  it('counts every eagerly loaded chunk instead of hiding weight in vendor splitting',()=>{
    expect(evaluateBundle([{path:'a.js',size:500000},{path:'b.js',size:400000}],['a.js','b.js'])).toContain('Initial JavaScript exceeds the 850000 byte aggregate budget (900000 bytes)');
  });
});
