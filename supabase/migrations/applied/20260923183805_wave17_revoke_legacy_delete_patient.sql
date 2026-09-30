-- Legacy privileged helper is not an API endpoint. Keep service-role access.
revoke execute on function private.delete_patient(uuid) from public, anon, authenticated;
