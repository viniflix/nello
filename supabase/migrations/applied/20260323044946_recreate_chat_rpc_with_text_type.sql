-- DROP FUNCTION FIRST TO CHANGE SIGNATURE
DROP FUNCTION IF EXISTS public.get_chat_recipient_profile(uuid);

-- RECREATE WITH TEXT TYPE
CREATE OR REPLACE FUNCTION public.get_chat_recipient_profile(recipient_id uuid)
RETURNS TABLE (
    id uuid,
    name text,
    avatar_url text,
    user_type text,
    is_active boolean,
    nutritionist_id uuid,
    last_seen_at timestamp with time zone
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.user_type,
        up.is_active,
        up.nutritionist_id,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.id = recipient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
