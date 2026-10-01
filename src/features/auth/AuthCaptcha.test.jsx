import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AuthCaptcha from './AuthCaptcha';

afterEach(() => { cleanup(); delete window.turnstile; });
it('clears expired and failed tokens, recreates on retry and ignores callbacks after leaving', async () => {
  let callbacks;
  window.turnstile = { render: vi.fn((_, options) => { callbacks = options; return 'widget'; }), remove: vi.fn() };
  const onToken = vi.fn();
  const view = render(<AuthCaptcha sitekey="synthetic" attempt={0} onToken={onToken} />);
  await waitFor(() => expect(window.turnstile.render).toHaveBeenCalledOnce());
  act(() => callbacks.callback('temporary-token'));
  expect(onToken).toHaveBeenLastCalledWith('temporary-token');
  act(() => callbacks['expired-callback']());
  expect(onToken).toHaveBeenLastCalledWith('');
  act(() => callbacks['error-callback']());
  expect(screen.getByRole('alert')).toHaveTextContent('verificação de segurança');
  const stale = callbacks;
  view.rerender(<AuthCaptcha sitekey="synthetic" attempt={1} onToken={onToken} />);
  await waitFor(() => expect(window.turnstile.render).toHaveBeenCalledTimes(2));
  expect(window.turnstile.remove).toHaveBeenCalledWith('widget');
  onToken.mockClear();
  act(() => stale.callback('expired-token'));
  expect(onToken).not.toHaveBeenCalled();
  view.unmount();
  act(() => callbacks.callback('late-token'));
  expect(onToken).not.toHaveBeenCalled();
});

it('does not load an external provider when CAPTCHA is not configured', () => {
  render(<AuthCaptcha sitekey="" attempt={0} onToken={vi.fn()} />);
  expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
});
