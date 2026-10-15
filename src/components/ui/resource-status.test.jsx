import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ResourceSection, ResourceStatus } from './resource-status';

it('does not accumulate empty status rows for confirmed resources', () => {
  const view = render(<>{Array.from({length:6},(_,index)=><ResourceStatus key={index} resource={{hasSnapshot:true,pending:true,refreshing:true}} />)}</>);
  expect(view.container).toBeEmptyDOMElement();
});

it('keeps the same focused draft node mounted through refresh and transient failure, then removes denied content', () => {
  const retry = vi.fn(), base = { hasSnapshot: true, pending: false };
  const content = <input aria-label="Synthetic draft" defaultValue="base" />;
  const view = render(<ResourceSection resource={base} label="histórico" onRetry={retry}>{content}</ResourceSection>);
  const input = screen.getByLabelText('Synthetic draft'); fireEvent.change(input, { target: { value: 'dirty' } }); input.focus(); input.setSelectionRange(1, 3);
  view.rerender(<ResourceSection resource={{ ...base, pending: true, refreshing: true }} label="histórico">{content}</ResourceSection>);
  expect(screen.getByLabelText('Synthetic draft')).toBe(input); expect(input).toHaveFocus(); expect(input.selectionStart).toBe(1);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(view.container.querySelector('section').children).toHaveLength(1);
  expect(input).toHaveValue('dirty');
  view.rerender(<ResourceSection resource={{ ...base, error: { message: 'Synthetic offline', retryable: true } }} label="histórico" onRetry={retry}>{content}</ResourceSection>);
  expect(input).toHaveValue('dirty'); expect(input).toHaveFocus(); fireEvent.click(screen.getByText('Tentar novamente')); expect(retry).toHaveBeenCalledOnce();
  view.rerender(<ResourceSection resource={{ hasSnapshot: false, error: { message: 'Synthetic denied' } }} label="histórico">{content}</ResourceSection>);
  expect(screen.queryByLabelText('Synthetic draft')).not.toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('Synthetic denied');
});
