-- DROP FUNCTION FIRST
DROP FUNCTION IF EXISTS public.get_chat_recipient_profile(uuid);

-- 1. Adicionar coluna last_seen_at em user_profiles (IF NOT EXISTS is safe)
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- 2. Atualizar RPC get_chat_recipient_profile
CREATE OR REPLACE FUNCTION public.get_chat_recipient_profile(recipient_id uuid)
RETURNS TABLE(
    id uuid,
    name text,
    user_type text,
    avatar_url text,
    is_active boolean,
    nutritionist_id uuid,
    last_seen_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_user_type text;
  caller_nutritionist_id uuid;
BEGIN
  -- 1. Pega as informações de quem está chamando a função
  SELECT
    p.user_type,
    p.nutritionist_id
  INTO
    caller_user_type,
    caller_nutritionist_id
  FROM
    public.user_profiles AS p
  WHERE
    p.id = caller_id;

  -- 2. Verifica as permissões
  IF caller_user_type = 'patient' AND caller_nutritionist_id = recipient_id THEN
    -- Se o CHAMADOR é um paciente E o RECIPIENTE é seu nutricionista, permite.
    RETURN QUERY
    SELECT
      up.id,
      up.name,
      up.user_type,
      up.avatar_url,
      up.is_active,
      up.nutritionist_id,
      up.last_seen_at
    FROM
      public.user_profiles AS up
    WHERE
      up.id = recipient_id;
      
  ELSIF caller_user_type = 'nutritionist' THEN
    -- Se o CHAMADOR é um nutricionista, permite que ele veja o perfil do paciente
    -- BUSCA NAS DUAS TABELAS DE VÍNCULO PARA GARANTIR
    IF EXISTS (
        SELECT 1 FROM public.nutritionist_patients 
        WHERE nutritionist_id = caller_id AND patient_id = recipient_id
    ) OR EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = recipient_id AND nutritionist_id = caller_id
    ) THEN
        RETURN QUERY
        SELECT
          up.id,
          up.name,
          up.user_type,
          up.avatar_url,
          up.is_active,
          up.nutritionist_id,
          up.last_seen_at
        FROM
          public.user_profiles AS up
        WHERE
          up.id = recipient_id;
    END IF;
  END IF;

END;
$$;
