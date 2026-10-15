import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTemplates } from './useTemplates';
import { supabase } from '@/infrastructure/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mocks
vi.mock('@/infrastructure/supabase/client', () => ({
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
    const orderMock = vi.fn().mockReturnThis();
    const limitMock = vi.fn().mockResolvedValue({ data: [{ id: '1', name: 'Test Template' }], error: null });
    const deleteMock = vi.fn().mockReturnThis();

    supabase.from.mockReturnValue({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
      limit: limitMock,
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
    expect(result.current.error).toBeNull();expect(result.current.hasMore).toBe(false);
    expect(supabase.from.mock.results[0].value.limit).toHaveBeenCalledWith(21);
    expect(supabase.from.mock.results[0].value.eq).toHaveBeenCalledWith('user_id',mockUser.id);
  });

  it('should fetch meal templates when type is meal', async () => {
    const { result } = renderHook(() => useTemplates('meal'), { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(supabase.from).toHaveBeenCalledWith('meal_templates');
    expect(result.current.error).toBeNull();expect(result.current.templates[0].name).toBe('Test Template');
  });

  it('does not fetch nutrition templates while another protocol group is open', () => {
    renderHook(() => useTemplates('diet', { enabled: false }), { wrapper: createWrapper() });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
