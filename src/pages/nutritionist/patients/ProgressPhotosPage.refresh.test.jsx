import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProgressPhotosPage from './ProgressPhotosPage';
const mocks = vi.hoisted(() => ({ photos: vi.fn(), weightError: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-owner' } }) }));
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => ({ patientId: 'synthetic-patient' }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/supabase/patient-queries', () => ({ logActivityEvent: vi.fn() }));
vi.mock('@/lib/supabase/progress-photos-queries', () => ({ getProgressPhotos: mocks.photos, uploadProgressPhoto: vi.fn(), updateProgressPhoto: vi.fn(), deleteProgressPhoto: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: table => { const query = { select: () => query, eq: () => query, not: () => query, order: () => query, limit: () => query, single: () => query,
  then: (resolve, reject) => Promise.resolve(table === 'user_profiles' ? { data: { name: 'Synthetic', slug: 'synthetic' } } : { data: null, error: mocks.weightError }).then(resolve, reject) }; return query; } } }));
describe('Photos failures are not empty histories', () => {
  beforeEach(() => { mocks.weightError = null; mocks.photos.mockResolvedValue({ data: [], error: null }); });
  it('surfaces a forbidden photo result instead of showing an empty timeline', async () => {
    mocks.photos.mockResolvedValue({ data: null, error: { status: 403 } });
    render(<MemoryRouter><ProgressPhotosPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/permissão/);
  });
  it('reports a failed weight source independently while the photo timeline remains useful', async () => {
    mocks.weightError = { code: 'NETWORK_FAILURE' };
    render(<MemoryRouter><ProgressPhotosPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Timeline de fotos')).toBeInTheDocument();
  });
});
