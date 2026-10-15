import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useQueryResource } from './useQueryResource';

it('keeps denied cache hidden during retry, until a new successful confirmation', () => {
  const cached = { data: ['private'], dataUpdatedAt: 1, status: 'success' };
  const { result, rerender } = renderHook(({ query, key }) => useQueryResource(query, key, []), { initialProps: { query: cached, key: 'a' } });
  expect(result.current.hasSnapshot).toBe(true);
  rerender({ query: { ...cached, error: { status: 403 }, status: 'error' }, key: 'a' });
  expect(result.current.data).toEqual([]);
  rerender({ query: { ...cached, isFetching: true, error: null }, key: 'a' });
  expect(result.current.data).toEqual([]); expect(result.current.canAct).toBe(false);
  rerender({ query: { ...cached, dataUpdatedAt: 2 }, key: 'a' });
  expect(result.current.data).toEqual(['private']); expect(result.current.canAct).toBe(true);
  rerender({ query: { data: undefined, isLoading: true }, key: 'b' });
  expect(result.current.data).toEqual([]);
});
