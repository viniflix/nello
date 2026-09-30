import { it, expect } from 'vitest';
import { relevantDiagnostic } from './diagnostic-policy.mjs';
it('blocks controlled React and CSS regressions without hiding legitimate output', () => {
  for (const line of ['Warning: Each child needs a unique key', 'Warning: chart defaultProps deprecated', 'CssSyntaxError: [postcss] invalid rule', 'Warning: An update was not wrapped in act(...)']) expect(relevantDiagnostic(line)).toBe(true);
  expect(relevantDiagnostic('expected login rejection')).toBe(false);
});
