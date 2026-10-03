import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ReferenceValuesModal from './ReferenceValuesModal';
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue({ data: {}, error: null }) }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getReferenceValues: async () => ({ data: null }), saveReferenceValues: mocks.save }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
it('keeps macro percentages independent and saves weight-based targets', async () => {
  render(<ReferenceValuesModal isOpen planId="synthetic-plan" onClose={vi.fn()} />);
  await screen.findByLabelText('Carboidratos (%)');
  fireEvent.change(screen.getByLabelText('Carboidratos (%)'), { target: { value: '60' } });
  fireEvent.change(screen.getByLabelText('Proteínas (%)'), { target: { value: '20' } });
  expect(screen.getByLabelText('Carboidratos (%)')).toHaveValue(60);
  fireEvent.change(screen.getByLabelText(/Peso \(kg\)/), { target: { value: '70' } });
  fireEvent.change(screen.getByLabelText(/Energia Total Diária/), { target: { value: '2000' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Gramas por Kg de Peso' }));
  for (const [name, value] of [['Proteínas', '2'], ['Carboidratos', '4'], ['Gorduras', '0']]) {
    fireEvent.change(screen.getByLabelText(new RegExp(`${name} \\(g/kg\\)`)), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Salvar', exact: true }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalled());
  expect(mocks.save.mock.calls[0][1]).toMatchObject({ macro_mode: 'g_per_kg', protein_g_per_kg: 2, carbs_g_per_kg: 4, fat_g_per_kg: 0 });
});
