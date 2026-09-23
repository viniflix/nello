import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TemplatesList from './TemplatesList';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAnamnesisTemplates', () => ({
  useAnamnesisTemplates: () => ({
    useTemplates: () => ({
      data: [{
        id: 'form-1', title: 'Anamnese', sections: [{
          id: 'section-1', title: 'Hábitos', fields: [{
            id: 'field-1', label: 'Atividade física',
            options: [{ label: 'Sim', value: 'sim' }, 'Não'],
          }],
        }],
      }],
      isLoading: false, isError: false,
    }),
    deleteTemplate: { mutateAsync: vi.fn() },
    seedBaseTemplates: { mutate: vi.fn(), isPending: false },
  }),
}));

describe('TemplatesList preview', () => {
  it('shows labels for both saved option formats without crashing', () => {
    render(<TemplatesList />);
    fireEvent.click(screen.getByTitle('Visualizar'));
    expect(screen.getByText('Sim')).toBeDefined();
    expect(screen.getByText('Não')).toBeDefined();
  });
});
