import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MediaViewer from './MediaViewer';
const mocks = vi.hoisted(() => ({ actor: 'actor-a', sign: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.actor } }) }));
vi.mock('@/lib/storage/privateFiles', () => ({ parsePrivateFile: value => ({ path: value }), signPrivateFile: mocks.sign }));
vi.mock('@/components/ui/private-image', () => ({ PrivateImage: props => <img {...props} alt={props.alt} /> }));
afterEach(() => { cleanup(); mocks.actor = 'actor-a'; mocks.sign.mockReset(); });
describe('private chat media controls', () => {
  it.each([['image', 'png', 'imagem'], ['video', 'mp4', 'vídeo']])('opens %s through a named native button', async (type, extension, label) => {
    mocks.sign.mockResolvedValue('/synthetic-file');
    const open = vi.fn();
    render(<MediaViewer mediaPath={`synthetic.${extension}`} mediaType={type} onImageClick={open} />);
    const button = await screen.findByRole('button', { name: `Abrir ${label} ${type === 'video' ? 'enviado' : 'enviada'}` });
    expect(button.tagName).toBe('BUTTON'); expect(button).toHaveAttribute('type', 'button');
    button.focus(); expect(button).toHaveFocus(); fireEvent.click(button);
    expect(open).toHaveBeenCalledWith('/synthetic-file', type);
  });
  it('does not display a previously signed resource while the actor changes', async () => {
    mocks.sign.mockResolvedValueOnce('/actor-a-file');
    const { rerender } = render(<MediaViewer mediaPath="synthetic.png" onImageClick={vi.fn()} />);
    await screen.findByRole('button', { name: 'Abrir imagem enviada' });
    mocks.sign.mockImplementationOnce(() => new Promise(() => {})); mocks.actor = 'actor-b';
    rerender(<MediaViewer mediaPath="synthetic.png" onImageClick={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.sign).toHaveBeenCalledTimes(2));
  });
});
