import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import FoodSelector from './FoodSelector';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./QuickFoodCreateDialog', () => ({ default: () => null }));
vi.mock('@/infrastructure/analytics/posthog', () => ({ Events: {}, track: vi.fn() }));
vi.mock('@/infrastructure/observability/telemetry', () => ({ captureOperationalError: vi.fn() }));
beforeEach(() => { mocks.rpc.mockClear(); mocks.rpc.mockImplementation((name, args) => ({ abortSignal: async () => ({ data: [{ id: args.p_query, name: args.p_query, source: args.p_source || 'TACO', calories: 100, protein: 1, carbs: 20, fat: 1 }] }) })); });

it('loads selectable breakfast foods without typing and honors the source filter', async () => {
    const select = vi.fn();
    render(<FoodSelector embedded isOpen mealType="breakfast" onSelect={select} />);
    const bread = await screen.findByRole('button', { name: /pão francês/ });
    fireEvent.click(bread);
    expect(select.mock.calls[0][0].name).toBe('pão francês');
    fireEvent.click(screen.getByRole('button', { name: 'TBCA', exact: true }));
    await waitFor(() => expect(mocks.rpc.mock.calls.some(([, args]) => args.p_source === 'TBCA' && args.p_query === 'ovo cozido')).toBe(true));
});

it('does not let a late suggestion response overwrite a typed search', async () => {
    let finish;
    mocks.rpc.mockImplementation((name, args) => ({ abortSignal: () => args.p_query === 'busca' ? Promise.resolve({ data: [{ id: 'searched', name: 'Resultado da busca', calories: 100, protein: 1, carbs: 1, fat: 1 }] }) : new Promise(resolve => { finish = resolve; }) }));
    render(<FoodSelector embedded isOpen mealType="other" onSelect={vi.fn()} />);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'busca' } });
    await screen.findByRole('button', { name: /Resultado da busca/ });
    finish({ data: [{ id: 'old', name: 'Sugestão atrasada', calories: 100, protein: 1, carbs: 1, fat: 1 }] });
    expect(screen.queryByText('Sugestão atrasada')).toBeNull();
    expect(screen.getByText('Resultado da busca')).toBeVisible();
});

it('shows a retry on catalog failure instead of pretending no foods exist', async () => {
    mocks.rpc.mockImplementation(() => ({ abortSignal: async () => ({ error: new Error('Falha sintética') }) }));
    render(<FoodSelector embedded isOpen mealType="lunch" onSelect={vi.fn()} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    expect(screen.queryByText('Nenhum alimento encontrado')).toBeNull();
});

it('starts substitution discovery in the original group and excludes the original catalog food', async () => {
    mocks.rpc.mockImplementation(() => ({ abortSignal: async () => ({ data: [
        { id: 'original', name: 'Original', source: 'TACO', group: 'Cereais', calories: 200, protein: 10, carbs: 30, fat: 2 },
        { id: 'alternative', name: 'Alternativa', source: 'TACO', group: 'Cereais', calories: 100, protein: 5, carbs: 15, fat: 1 },
    ] }) }));
    render(<FoodSelector embedded isOpen onSelect={vi.fn()} targetGroup="Cereais" originalFood={{ food_id: 'original', calories: 100, protein: 5, carbs: 15, fat: 1, food: { id: 'original', name: 'Original', group: 'Cereais' } }} />);
    await screen.findByRole('button', { name: /Alternativa Macros próximos/ });
    expect(screen.queryByRole('button', { name: /^Original/ })).toBeNull();
    expect(mocks.rpc.mock.calls.every(([, args]) => args.p_group === 'Cereais')).toBe(true);
});
