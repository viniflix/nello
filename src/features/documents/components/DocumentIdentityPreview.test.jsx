import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DocumentIdentityPreview from './DocumentIdentityPreview';

describe('DocumentIdentityPreview', () => {
  it('keeps Nello attribution and safe placeholders in an A4 preview', () => {
    render(<DocumentIdentityPreview identity={{ primary_color: '#123456', accent_color: '#ABCDEF' }} />);
    expect(screen.getByRole('heading', { name: /preview do documento/i })).toBeInTheDocument();
    expect(screen.getByText('Gerado com Nello')).toBeInTheDocument();
    expect(screen.getByText('Nome do profissional')).toBeInTheDocument();
    expect(screen.getByText('CRN validado na plataforma')).toBeInTheDocument();
    expect(screen.getByText('Sua logo')).toBeInTheDocument();
  });

  it('renders private preview URLs only in the requested visual slots', () => {
    render(<DocumentIdentityPreview identity={{ professional_name: 'Dra. Nello' }} assetUrls={{ logo: 'blob:logo', visual_signature: 'blob:signature', stamp: 'blob:stamp' }} />);
    expect(screen.getByAltText('Logo documental do consultório')).toHaveAttribute('src', 'blob:logo');
    expect(screen.getByAltText('Assinatura visual')).toHaveAttribute('src', 'blob:signature');
    expect(screen.getByAltText('Carimbo visual')).toHaveAttribute('src', 'blob:stamp');
  });
});
