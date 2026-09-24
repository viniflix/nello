import { describe, expect, it } from 'vitest';
import { parseGlycemiaMgDl } from './glycemia';

describe('parseGlycemiaMgDl', () => {
  it.each(['0', '-2', 'NaN', 'Infinity', '601', '', '95mg', '1e2'])(
    'rejects invalid reading %s', (input) => expect(parseGlycemiaMgDl(input)).toBeNull()
  );
  it.each([['20', 20], ['600', 600], ['70', 70], ['180', 180], ['95,5', 95.5]])(
    'accepts reading %s', (input, expected) => expect(parseGlycemiaMgDl(input)).toBe(expected)
  );
});
