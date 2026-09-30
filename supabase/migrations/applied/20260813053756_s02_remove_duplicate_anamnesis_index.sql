-- S0.2 / estágio 4: os dois índices tinham definição idêntica.
-- Preserva o nome canônico e mais descritivo.
set lock_timeout = '5s';
set statement_timeout = '30s';

drop index if exists public.idx_anamnesis_templates_nutri;
