CREATE OR REPLACE FUNCTION get_patients_for_new_chat(p_nutritionist_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    avatar_url TEXT,
    is_active BOOLEAN,
    last_seen_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.nutritionist_id = p_nutritionist_id
    ORDER BY up.is_active DESC, up.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
