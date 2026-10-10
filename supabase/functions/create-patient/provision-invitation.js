// Set the approved initial credential before issuing a one-time invitation.
// Auth password updates revoke outstanding confirmation/recovery tokens.
export async function provisionPatientInvitation(authAdmin, { email, password, metadata, redirectTo }) {
  const { data, error } = await authAdmin.createUser({
    email, password, email_confirm: false, user_metadata: metadata,
  });
  if (error || !data?.user?.id) return { error: error || { status: 502 }, accountCreated: false };
  const userId = data.user.id;
  const { data: invitation, error: invitationError } = await authAdmin.inviteUserByEmail(email, { redirectTo });
  return {
    userId,
    accountCreated: true,
    initialPasswordAvailable: true,
    invitationSent: !invitationError && invitation?.user?.id === userId,
    invitationError: invitationError || (invitation?.user?.id !== userId ? { status: 502 } : null),
  };
}
