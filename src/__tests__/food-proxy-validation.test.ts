import { describe, expect, it } from 'vitest';
import { validateFoodRequest } from '../../supabase/functions/openfoodfacts-proxy/validation';

describe('food proxy request validation', () => {
  it('allows normal search and barcode/product identifiers', () => {
    expect(validateFoodRequest({ action: 'search', query: '  arroz   integral  ' })).toEqual({ action: 'search', query: 'arroz integral' });
    expect(validateFoodRequest({ action: 'product', productCode: '7891000100103' })).toEqual({ action: 'product', productCode: '7891000100103' });
    expect(validateFoodRequest({ action: 'product', productCode: 'fs_12345' })).toEqual({ action: 'product', productCode: 'fs_12345' });
  });

  it('rejects malformed or unbounded inputs before an external call', () => {
    for (const payload of [null, [], { action: 'search' }, { action: 'search', query: 'ab' },
      { action: 'search', query: 'x'.repeat(101) }, { action: 'product', productCode: '../escape' },
      { action: 'product', productCode: null }, { action: 'other', query: 'rice' }]) {
      expect(validateFoodRequest(payload)).toBeNull();
    }
  });
});
