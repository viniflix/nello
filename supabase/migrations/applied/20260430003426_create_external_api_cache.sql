CREATE TABLE IF NOT EXISTS public.external_api_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL, -- 'openfoodfacts'
    request_key TEXT NOT NULL, -- 'search:milka' ou 'product:789...'
    response_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(api_name, request_key)
);

-- Index para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_external_api_cache_key ON public.external_api_cache (api_name, request_key);

-- Política de RLS (permitir que a Edge Function leia e escreva, mas o público não)
-- Como as Edge Functions usam a SERVICE_ROLE, elas ignoram RLS.
-- Vamos deixar RLS ativado e sem políticas públicas para segurança.
ALTER TABLE public.external_api_cache ENABLE ROW LEVEL SECURITY;

-- Comentário para documentação
COMMENT ON TABLE public.external_api_cache IS 'Cache para resultados de APIs externas (OpenFoodFacts, etc) para evitar rate limits e melhorar performance.';
