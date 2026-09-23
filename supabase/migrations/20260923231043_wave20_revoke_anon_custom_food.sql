-- The RPC checks auth.uid(), but an older direct grant still exposed EXECUTE to anon.
revoke execute on function public.save_custom_food_with_measures(uuid,jsonb,jsonb) from anon;
