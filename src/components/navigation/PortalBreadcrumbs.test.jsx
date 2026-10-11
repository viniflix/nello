import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PortalBreadcrumbs from './PortalBreadcrumbs';

it('renders linked ancestors and one current page in an ordered navigation', () => {
  render(<MemoryRouter initialEntries={['/nutritionist/patients/demo/meal-plan/12/summary']}><PortalBreadcrumbs /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Navegação estrutural' });
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Plano alimentar' })).toHaveAttribute('href', '/nutritionist/patients/demo/meal-plan');
  expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Resumo nutricional');
});
it('preserves the editor back callback and avoids duplicated navigation in the shell', async () => {
  const onBack = vi.fn();
  render(<MemoryRouter initialEntries={['/nutritionist/patients/demo/meal-plan']}><PortalBreadcrumbs /><PortalBreadcrumbs embedded extraLabel="Editar plano" onBack={onBack} /></MemoryRouter>);
  expect(screen.getAllByRole('navigation')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Plano alimentar' }));
  await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  expect(screen.getByText('Editar plano')).toHaveAttribute('aria-current', 'page');
});

it.each(['/nutritionist', '/nutritionist/financial', '/nutritionist/agenda', '/nutritionist/templates', '/patient', '/patient/diario', '/patient/chat', '/patient/add-meal'])('avoids redundant navigation or an empty band at %s', path => {
  const { container } = render(<MemoryRouter initialEntries={[path]}><PortalBreadcrumbs /></MemoryRouter>);
  expect(container).toBeEmptyDOMElement();
});

function CurrentPath() { return <output data-testid="path">{useLocation().pathname}</output>; }

it.each(['local', 'saving', 'error', 'conflict'])('keeps the editor when flushing a %s draft fails', async () => {
  const onBack = vi.fn().mockResolvedValue(false);
  render(<MemoryRouter initialEntries={['/nutritionist/patients/demo/meal-plan']}><PortalBreadcrumbs embedded extraLabel="Editar plano" onBack={onBack} /><CurrentPath /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Início' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
  expect(screen.getByTestId('path')).toHaveTextContent('/nutritionist/patients/demo/meal-plan');
  expect(onBack).toHaveBeenCalledOnce();
});

it('waits for successful persistence and locks repeated ancestor clicks', async () => {
  let resolve;
  const onBack = vi.fn(() => new Promise(r => { resolve = r; }));
  render(<MemoryRouter initialEntries={['/nutritionist/patients/demo/meal-plan']}><PortalBreadcrumbs embedded extraLabel="Novo plano" onBack={onBack} /><CurrentPath /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Início' }));
  fireEvent.click(screen.getByRole('button', { name: 'Início' }));
  expect(onBack).toHaveBeenCalledOnce();
  expect(screen.getByTestId('path')).toHaveTextContent('/nutritionist/patients/demo/meal-plan');
  resolve(true);
  await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/nutritionist'));
});

it('exposes all collapsed ancestors through the keyboard accessible menu', async () => {
  render(<MemoryRouter initialEntries={['/nutritionist/patients/demo/anamnese/new']}><PortalBreadcrumbs /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver níveis anteriores' })).toBeEnabled());
  const trigger = screen.getByRole('button', { name: 'Ver níveis anteriores' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  expect(await screen.findByRole('menuitem', { name: 'Prontuário' })).toHaveAttribute('href', '/nutritionist/patients/demo/hub');
  expect(screen.getByRole('menuitem', { name: 'Clínico' })).toHaveAttribute('href', '/nutritionist/patients/demo/hub?tab=clinical');
});
