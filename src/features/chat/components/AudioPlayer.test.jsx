import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AudioPlayer from './AudioPlayer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function metadata(container, duration = 90) {
  const audio = container.querySelector('audio');
  Object.defineProperty(audio, 'duration', { configurable: true, value: duration });
  fireEvent.loadedMetadata(audio);
  return audio;
}
describe('accessible chat audio contract', () => {
  it('exposes a named seek control, time and bounded values after metadata', () => {
    const { container } = render(<AudioPlayer src="/synthetic.ogg" />);
    expect(screen.getByRole('slider', { name: 'Posição do áudio' })).toBeDisabled();
    const audio = metadata(container);
    const slider = screen.getByRole('slider', { name: 'Posição do áudio' });
    expect(slider).toBeEnabled();
    expect(slider).toHaveAttribute('max', '90');
    expect(slider).toHaveAttribute('aria-valuetext', '0:00 de 1:30');
    fireEvent.change(slider, { target: { value: '35' } });
    expect(audio.currentTime).toBe(35);
    expect(slider).toHaveAttribute('aria-valuetext', '0:35 de 1:30');
  });
  it('reflects actual media events rather than optimistic playback', () => {
    const { container } = render(<AudioPlayer src="/synthetic.ogg" />);
    const audio = metadata(container);
    fireEvent.play(audio);
    expect(screen.getByRole('button', { name: 'Pausar áudio' })).toBeInTheDocument();
    fireEvent.pause(audio);
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
    fireEvent.play(audio); fireEvent.ended(audio);
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
  });
  it('reports a rejected play safely and permits retry without leaking its URL', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('secret signed URL'));
    const { container } = render(<AudioPlayer src="/synthetic.ogg" />);
    metadata(container);
    fireEvent.click(screen.getByRole('button', { name: 'Reproduzir áudio' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível reproduzir o áudio. Tente novamente.'));
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeEnabled();
  });
  it('resets seek, playback and errors when a different source replaces the media', () => {
    const { container, rerender } = render(<AudioPlayer src="/first.ogg" />);
    const audio = metadata(container);
    audio.currentTime = 45; fireEvent.timeUpdate(audio); fireEvent.play(audio);
    rerender(<AudioPlayer src="/second.ogg" />);
    expect(screen.getByRole('slider')).toBeDisabled();
    expect(screen.getByRole('slider')).toHaveValue('0');
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
  });
  it.each([NaN, Infinity, 0, -1])('does not allow seeking invalid duration %s', duration => {
    const { container } = render(<AudioPlayer src="/synthetic.ogg" />);
    metadata(container, duration);
    expect(screen.getByRole('slider')).toBeDisabled();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '0:00 de 0:00');
  });
});
