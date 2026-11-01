import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, Link, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { useDraftGuard } from '@/hooks/useDraftGuard';
import DraftGuardProvider from './DraftGuardProvider';

function DraftForm() {
  const location = useLocation(), navigate = useNavigate();
  const [value, setValue] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [secondDirty, setSecondDirty] = useState(false);
  useDraftGuard(location.pathname === '/edit' && Boolean(value) && !confirmed);
  useDraftGuard(location.pathname === '/edit' && secondDirty);
  return <><h1>{location.pathname}</h1>{location.pathname === '/edit' && <>
    <label>Draft<input value={value} onChange={event => { setValue(event.target.value); setConfirmed(false); }} /></label>
    <button onClick={() => navigate('/other')}>Programmatic</button>
    <button onClick={() => navigate('/other', { replace: true })}>Replace</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate('/edit?tab=other')}>Query context</button>
    <button onClick={() => navigate('/edit', { state: { record: 'other' } })}>State context</button>
    <Link to='/edit#part'>Same document</Link>
    <label>Second draft<input type='checkbox' checked={secondDirty} onChange={event => setSecondDirty(event.target.checked)} /></label>
    <Link to='/other'>Link</Link>
    <button onClick={() => setConfirmed(true)}>Server ACK</button>
  </>}</>;
}
let router;
afterEach(() => router?.dispose());
function setup(strict = false) {
  router = createMemoryRouter([{ path: '*', element: <DraftGuardProvider><DraftForm /></DraftGuardProvider> }], { initialEntries: ['/prior', '/edit'], initialIndex: 1 });
  render(strict ? <React.StrictMode><RouterProvider router={router} /></React.StrictMode> : <RouterProvider router={router} />);
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Unconfirmed draft' } });
}
describe('Unconfirmed draft navigation', () => {
  it.each(['Programmatic', 'Replace', 'Back', 'Query context', 'State context'])('keeps the draft when %s navigation is cancelled', async name => {
    setup(); fireEvent.click(screen.getByRole('button', { name }));
    expect(router.state.location.pathname).toBe('/edit');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('não sobrevive ao recarregamento');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Draft')).toHaveValue('Unconfirmed draft');
  });
  it('confirms an internal link once and leaves for its exact destination', async () => {
    setup(); fireEvent.click(screen.getByRole('link', { name: 'Link' }));
    expect(router.state.location.pathname).toBe('/edit');
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem confirmação' }));
    await screen.findByRole('heading', { name: '/other' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it('unblocks pending navigation when the server confirms the draft', async () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Programmatic' }));
    expect(router.state.location.pathname).toBe('/edit');
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Server ACK', hidden: true }));
    await screen.findByRole('heading', { name: '/other' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it('prevents document unload only until the server confirms', async () => {
    setup(); const pending = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pending); expect(pending.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Server ACK' }));
    await act(async () => {});
    const confirmed = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(confirmed);
    expect(confirmed.defaultPrevented).toBe(false);
  });
});

it('keeps a second dirty consumer registered after the first server ACK, including StrictMode cleanup', async () => {
  setup(true); fireEvent.click(screen.getByLabelText('Second draft'));
  fireEvent.click(screen.getByRole('button', { name: 'Programmatic' }));
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Server ACK', hidden: true }));
  await act(async () => {});
  expect(router.state.location.pathname).toBe('/edit');
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Second draft'));
  await screen.findByRole('heading', { name: '/other' });
});
it('keeps same-document hash navigation available without abandoning the draft', async () => {
  setup(); fireEvent.click(screen.getByRole('link', { name: 'Same document' }));
  await waitFor(() => expect(router.state.location.hash).toBe('#part'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Draft')).toHaveValue('Unconfirmed draft');
});
it('returns focus to the navigation control after cancelling', async () => {
  setup(); const button = screen.getByRole('button', { name: 'Programmatic' });
  button.focus(); fireEvent.click(button); await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
  await waitFor(() => expect(button).toHaveFocus());
});
