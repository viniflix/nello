import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NutritionistProfilePage from './NutritionistProfilePage';
const mocks = vi.hoisted(() => ({ user: { id: 'synthetic-a', profile: { name: 'Synthetic A' } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/components/profile/ProfilePersonalTab', async () => {
  const React = await import('react');
  function SyntheticPersonalTab({ profile }) {
    const [value, setValue] = React.useState(profile.name || '');
    return <><input aria-label="Synthetic personal draft" value={value} onChange={event => setValue(event.target.value)} /><p>{profile.name}</p></>;
  }
  return { default: SyntheticPersonalTab };
});
vi.mock('@/components/profile/ProfileAgendaTab', () => ({ default: () => null }));
vi.mock('@/components/profile/ProfileFinancialTab', () => ({ default: () => null }));
vi.mock('@/components/shared/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('./ProfessionalVerificationSection', () => ({ default: () => null }));
vi.mock('@/components/verification/StudentSupervisionCard', () => ({ default: () => null }));
vi.mock('@/features/documents/components/DocumentIdentitySection', () => ({ default: () => null }));
vi.mock('@/features/clinical-science/components/ClinicalProtocolCatalogSection', () => ({ default: () => null }));
vi.mock('@/components/profile/AccountEmailChange', () => ({ default: () => null }));
const view = () => <MemoryRouter><NutritionistProfilePage /></MemoryRouter>;
describe('Nutritionist profile local state', () => {
  beforeEach(() => { mocks.user = { id: 'synthetic-a', profile: { name: 'Synthetic A' } }; });
  it('keeps personal draft and focus while reflecting an actual profile update', async () => {
    const { rerender } = render(view()); await act(async () => {});
    const input = screen.getByLabelText('Synthetic personal draft');
    fireEvent.change(input, { target: { value: 'Local draft' } }); input.focus();
    mocks.user = { ...mocks.user }; rerender(view()); await act(async () => {});
    expect(input).toHaveValue('Local draft'); expect(input).toHaveFocus();
    mocks.user = { ...mocks.user, profile: { name: 'Updated profile' } }; rerender(view()); await act(async () => {});
    expect(screen.getByText('Updated profile')).toBeInTheDocument(); expect(input).toHaveValue('Local draft');
  });
  it('reinitializes personal state on an actual account change', async () => {
    const { rerender } = render(view()); await act(async () => {});
    fireEvent.change(screen.getByLabelText('Synthetic personal draft'), { target: { value: 'Private A' } });
    mocks.user = { id: 'synthetic-b', profile: { name: 'Synthetic B' } }; rerender(view()); await act(async () => {});
    expect(screen.getByLabelText('Synthetic personal draft')).toHaveValue('Synthetic B');
  });
});
