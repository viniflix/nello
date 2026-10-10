import { expect, it, vi } from 'vitest';
import { provisionPatientInvitation } from '../../../supabase/functions/create-patient/provision-invitation';

const request = { email: 'fake@example.invalid', password: '010190', metadata: { nello_provisioning_nonce: 'fake-authorized-intent' }, redirectTo: 'https://nello.example/update-password?mode=invite' };
it('sets the approved initial password before issuing one invitation and never revokes it with a later password update', async () => {
  const admin = { createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'fake' } } }), inviteUserByEmail: vi.fn().mockResolvedValue({ data: { user: { id: 'fake' } } }), updateUserById: vi.fn() };
  const result = await provisionPatientInvitation(admin, request);
  expect(admin.createUser).toHaveBeenCalledWith({ email: request.email, password: '010190', email_confirm: false, user_metadata: request.metadata });
  expect(admin.createUser.mock.invocationCallOrder[0]).toBeLessThan(admin.inviteUserByEmail.mock.invocationCallOrder[0]);
  expect(admin.inviteUserByEmail).toHaveBeenCalledExactlyOnceWith(request.email, { redirectTo: request.redirectTo });
  expect(admin.updateUserById).not.toHaveBeenCalled();
  expect(result).toMatchObject({ userId: 'fake', invitationSent: true, initialPasswordAvailable: true });
});
it('does not send an invitation if creation is denied', async () => {
  const error = { status: 422 };
  const admin = { createUser: vi.fn().mockResolvedValue({ error }), inviteUserByEmail: vi.fn() };
  expect(await provisionPatientInvitation(admin, request)).toEqual({ error, accountCreated: false });
  expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
});
it('preserves the created identity and reports an SMTP failure without claiming delivery or deleting history', async () => {
  const error = { status: 503 };
  const admin = { createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'fake' } } }), inviteUserByEmail: vi.fn().mockResolvedValue({ error }), deleteUser: vi.fn() };
  expect(await provisionPatientInvitation(admin, request)).toMatchObject({ userId: 'fake', accountCreated: true, invitationSent: false, invitationError: error });
  expect(admin.deleteUser).not.toHaveBeenCalled();
});
