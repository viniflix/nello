import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PortalBreadcrumbs from './PortalBreadcrumbs';

it('renders linked ancestors and one current page in an ordered navigation', () => {
  render(<MemoryRouter initialEntries={['/nutritionist/patients/demo/meal-plan/12/summary']}><PortalBreadcrumbs /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Navegação estrutural' });
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Plano alimentar' })).toHaveAttribute('href', '/nutritionist/patients/demo/meal-plan');
  expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Resumo nutricional');
});
it('preserves the editor back callback and avoids duplicated navigation in the shell', () => {
  const onBack = vi.fn();
  render(<MemoryRouter initialEntries={['/nutritionist/patients/demo/meal-plan']}><PortalBreadcrumbs /><PortalBreadcrumbs embedded extraLabel="Editar plano" onBack={onBack} /></MemoryRouter>);
  expect(screen.getAllByRole('navigation')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Plano alimentar' }));
  expect(onBack).toHaveBeenCalledOnce();
  expect(screen.getByText('Editar plano')).toHaveAttribute('aria-current', 'page');
});
