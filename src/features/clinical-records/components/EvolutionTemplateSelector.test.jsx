import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvolutionTemplateSelector from './EvolutionTemplateSelector';
import * as evolutionQueries from '../api/evolution-queries';

vi.mock('../api/evolution-queries', () => ({ listEvolutionTemplates: vi.fn() }));

const template = {
  code: 'soap',
  name: 'SOAP',
  description: 'Evolucao estruturada',
  sections: [{ key: 'subjective', label: 'Subjetivo' }],
};

const deferred = () => {
  let resolve;
  const promise = new Promise((resolver) => { resolve = resolver; });
  return { promise, resolve };
};

describe('EvolutionTemplateSelector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders loading, an error with retry, and an empty state', async () => {
    let resolveFirst;
    evolutionQueries.listEvolutionTemplates
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ data: [], error: null });
    render(<EvolutionTemplateSelector open onOpenChange={vi.fn()} onSelectTemplate={vi.fn()} />);

    expect(screen.getByText(/carregando modelos/i)).toBeInTheDocument();
    resolveFirst({ data: null, error: { message: 'falha de rede' } });
    expect(await screen.findByText('falha de rede')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByText(/nenhum modelo.*dispon.vel/i)).toBeInTheDocument();
  });

  it('submits template, clinical date, visibility and contextual retrospective reason', async () => {
    evolutionQueries.listEvolutionTemplates.mockResolvedValue({ data: [template], error: null });
    const onSelectTemplate = vi.fn().mockResolvedValue(true);
    render(<EvolutionTemplateSelector open onOpenChange={vi.fn()} onSelectTemplate={onSelectTemplate} />);

    fireEvent.change(await screen.findByLabelText(/data e hora cl.nica/i), {
      target: { value: '2026-07-13T08:30' },
    });
    expect(screen.getByLabelText(/motivo do registro retroativo/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/motivo do registro retroativo/i), {
      target: { value: 'Consulta registrada no dia seguinte' },
    });
    fireEvent.change(screen.getByLabelText(/visibilidade/i), {
      target: { value: 'shared_with_patient' },
    });
    expect(screen.getByText(/direitos legais de acesso e exporta/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /usar modelo soap/i }));

    await waitFor(() => expect(onSelectTemplate).toHaveBeenCalledWith(expect.objectContaining({
      template,
      encounterAt: new Date('2026-07-13T08:30').toISOString(),
      visibility: 'shared_with_patient',
      retrospectiveReason: 'Consulta registrada no dia seguinte',
    })));
  });

  it('ignores a stale template response after the dialog is reopened', async () => {
    const firstLoad = deferred();
    const newerTemplate = { ...template, code: 'newer', name: 'Modelo atual' };
    evolutionQueries.listEvolutionTemplates
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce({ data: [newerTemplate], error: null });
    const { rerender } = render(
      <EvolutionTemplateSelector open onOpenChange={vi.fn()} onSelectTemplate={vi.fn()} />,
    );

    rerender(<EvolutionTemplateSelector open={false} onOpenChange={vi.fn()} onSelectTemplate={vi.fn()} />);
    rerender(<EvolutionTemplateSelector open onOpenChange={vi.fn()} onSelectTemplate={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /usar modelo modelo atual/i })).toBeInTheDocument();

    firstLoad.resolve({ data: [template], error: null });
    await firstLoad.promise;
    await waitFor(() => expect(screen.queryByRole('button', { name: /usar modelo soap/i })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /usar modelo modelo atual/i })).toBeInTheDocument();
  });

  it('releases a stale submission on close without letting it clear a newer submission', async () => {
    const creationA = deferred();
    const creationB = deferred();
    evolutionQueries.listEvolutionTemplates.mockResolvedValue({ data: [template], error: null });
    const onSelectTemplate = vi.fn()
      .mockReturnValueOnce(creationA.promise)
      .mockReturnValueOnce(creationB.promise);
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <EvolutionTemplateSelector open onOpenChange={onOpenChange} onSelectTemplate={onSelectTemplate} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /usar modelo soap/i }));
    expect(screen.getByRole('button', { name: /usar modelo soap/i })).toBeDisabled();
    rerender(<EvolutionTemplateSelector open={false} onOpenChange={onOpenChange} onSelectTemplate={onSelectTemplate} />);
    rerender(<EvolutionTemplateSelector open onOpenChange={onOpenChange} onSelectTemplate={onSelectTemplate} />);

    const reopenedButton = await screen.findByRole('button', { name: /usar modelo soap/i });
    expect(reopenedButton).toBeEnabled();
    fireEvent.click(reopenedButton);
    expect(onSelectTemplate).toHaveBeenCalledTimes(2);
    expect(reopenedButton).toBeDisabled();

    await act(async () => {
      creationA.resolve(true);
      await creationA.promise;
    });
    expect(reopenedButton).toBeDisabled();

    await act(async () => {
      creationB.resolve(true);
      await creationB.promise;
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
