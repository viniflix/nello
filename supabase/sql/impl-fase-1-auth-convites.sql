-- Fase 1: Auth + Convites
-- Ref: PLANEJAMENTO-IMPLEMENTACAO-BACKEND.md
-- Executar em staging primeiro. Trigger em auth.users pode exigir permissões do projeto Supabase.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Função: criar user_profiles ao inserir em auth.users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'patient'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Perfil já existe (ex.: criado por policy/self-healing)
    RETURN NEW;
END;
$$;

-- Trigger em auth.users (no Supabase pode ser necessário executar com role que tenha acesso a auth)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2) Função: resgatar código de convite (access_codes) e vincular paciente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_invite_code(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code_record record;
  already_linked boolean;
BEGIN
  -- 1) Código válido
  SELECT * INTO code_record
  FROM public.access_codes
  WHERE code = input_code
    AND expires_at > now()
    AND uses_count < max_uses;

  IF code_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Código inválido ou expirado.');
  END IF;

  -- 2) Já vinculado?
  SELECT EXISTS(
    SELECT 1 FROM public.nutritionist_patients
    WHERE nutritionist_id = code_record.nutritionist_id
      AND patient_id = auth.uid()
  ) INTO already_linked;

  IF already_linked THEN
    RETURN jsonb_build_object('success', false, 'message', 'Você já é paciente deste nutricionista.');
  END IF;

  -- 3) Criar vínculo
  INSERT INTO public.nutritionist_patients (nutritionist_id, patient_id)
  VALUES (code_record.nutritionist_id, auth.uid());

  -- 4) Queimar código
  UPDATE public.access_codes
  SET uses_count = uses_count + 1
  WHERE id = code_record.id;

  RETURN jsonb_build_object('success', true, 'nutritionist_id', code_record.nutritionist_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Função + trigger: notificar usuário existente quando recebe convite (invitations)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id
  FROM public.user_profiles
  WHERE email = NEW.patient_email;

  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link_url)
    VALUES (
      target_user_id,
      'info',
      'Convite de Nutricionista',
      'Você recebeu um convite para se conectar a um profissional.',
      '/patient/invites'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invite_created ON public.invitations;
CREATE TRIGGER on_invite_created
  AFTER INSERT ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_invite();

COMMIT;

-- Rollback (se necessário):
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP TRIGGER IF EXISTS on_invite_created ON public.invitations;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP FUNCTION IF EXISTS public.notify_invite();
-- DROP FUNCTION IF EXISTS public.redeem_invite_code(text);
