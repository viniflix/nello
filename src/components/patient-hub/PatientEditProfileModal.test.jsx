import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PatientEditProfileModal from './PatientEditProfileModal';

const updateProfile = vi.fn(); const saveGuardian = vi.fn();
vi.mock('@/features/clinical-records/api/record-foundation-queries', () => ({
  updatePatientProgressiveProfile: (...args) => updateProfile(...args),
  savePatientLegalGuardian: (...args) => saveGuardian(...args), revokePatientLegalGuardian: vi.fn()
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/supabase/patient-queries', () => ({ updatePatientProfile: vi.fn() }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { storage: { from: vi.fn() } } }));

describe('PatientEditProfileModal integration', () => {
  beforeEach(() => { updateProfile.mockReset().mockResolvedValue({ error: null }); saveGuardian.mockReset().mockResolvedValue({ error: null }); });
  it('preserves the avatar and refreshes after profile RPC success', async () => {
    const refresh = vi.fn();
    render(<PatientEditProfileModal isOpen onClose={vi.fn()} patientData={{ id: 'p1', name: 'Ana', avatar_url: '/ana.png' }} foundation={{ active_episode: { id: 'e1' } }} onSaveSuccess={refresh} />);
    expect(screen.getByRole('img', { name: /avatar do paciente/i })).toHaveAttribute('src', '/ana.png');
    fireEvent.click(screen.getByRole('button', { name: /salvar perfil/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Ana' }), 'nutritionist'));
    expect(refresh).toHaveBeenCalled();
  });

  it('passes only the active episode to guardian UI and prevents a null RPC', () => {
    render(<PatientEditProfileModal isOpen onClose={vi.fn()} patientData={{ id: 'p1', name: 'Ana' }} foundation={{}} />);
    expect(screen.getByText(/inicie um episódio de cuidado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adicionar responsável/i })).toBeDisabled();
    expect(saveGuardian).not.toHaveBeenCalled();
  });
});
