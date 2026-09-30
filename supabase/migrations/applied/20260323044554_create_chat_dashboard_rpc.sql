CREATE OR REPLACE FUNCTION public.get_nutritionist_conversations(p_nutritionist_id uuid)
RETURNS TABLE(
    recipient_id uuid,
    recipient_name text,
    recipient_avatar text,
    last_message_content text,
    last_message_at timestamptz,
    unread_count bigint,
    is_active boolean,
    last_seen_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH last_messages AS (
        SELECT DISTINCT ON (
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END
        )
            from_id,
            to_id,
            message,
            message_type,
            media_url,
            created_at,
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END as other_user_id
        FROM public.chats
        WHERE from_id = p_nutritionist_id OR to_id = p_nutritionist_id
        ORDER BY other_user_id, created_at DESC
    ),
    unread_counts AS (
        SELECT 
            (content->>'from_id')::uuid as other_user_id, 
            count(*) as count
        FROM public.notifications
        WHERE user_id = p_nutritionist_id AND type = 'new_message' AND (is_read = false OR is_read IS NULL)
        GROUP BY (content->>'from_id')::uuid
    )
    SELECT 
        up.id as recipient_id,
        up.name as recipient_name,
        up.avatar_url as recipient_avatar,
        CASE 
            WHEN lm.message_type = 'audio' THEN '🎤 Áudio'
            WHEN lm.message_type = 'image' THEN '📷 Imagem'
            WHEN lm.message_type = 'file' THEN '📁 Arquivo'
            ELSE lm.message
        END as last_message_content,
        lm.created_at as last_message_at,
        COALESCE(uc.count, 0) as unread_count,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    JOIN last_messages lm ON up.id = lm.other_user_id
    LEFT JOIN unread_counts uc ON up.id = uc.other_user_id
    ORDER BY lm.created_at DESC;
END;
$$;
