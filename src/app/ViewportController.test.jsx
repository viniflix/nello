import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import ViewportController from './ViewportController';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('responds to a keyboard viewport and releases its listeners without retaining zoom dimensions', () => {
  const viewport = new EventTarget(); viewport.height = 400; viewport.scale = 1;
  vi.stubGlobal('visualViewport', viewport);
  const { unmount } = render(<ViewportController />);
  expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('400px');
  viewport.height = 250; viewport.scale = 2; viewport.dispatchEvent(new Event('resize'));
  expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe(`${window.innerHeight}px`);
  unmount(); expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('');
});
