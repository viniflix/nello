import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTemplates } from './useTemplates';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mocks
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Helper para encapsular em QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }) => React.createElement(
    QueryClientProvider,
    { client: queryClient },
    children
  );
};

describe('useTemplates Hook', () => {
  const mockUser = { id: 'user-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });
    
    // Setup default supabase mock chain
    const selectMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnThis();
    const orderMock = vi.fn().mockResolvedValue({ data: [{ id: '1', name: 'Test Template' }], error: null });
    const deleteMock = vi.fn().mockReturnThis();

    supabase.from.mockReturnValue({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
      delete: deleteMock,
    });
  });

  it('should fetch diet templates by default', async () => {
    const { result } = renderHook(() => useTemplates(), { wrapper: createWrapper() });

    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(supabase.from).toHaveBeenCalledWith('diet_templates');
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].name).toBe('Test Template');
  });

  it('should fetch meal templates when type is meal', async () => {
    const { result } = renderHook(() => useTemplates('meal'), { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(supabase.from).toHaveBeenCalledWith('meal_templates');
  });
});
