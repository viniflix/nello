-- BH24-01: contain an unsafe SECURITY DEFINER deletion RPC until its
-- authorization and immutable test-clone provenance are replaced.
REVOKE ALL ON FUNCTION public.force_delete_test_clone(uuid) FROM PUBLIC, anon, authenticated;
