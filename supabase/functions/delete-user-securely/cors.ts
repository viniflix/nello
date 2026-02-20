const getAllowedOrigins = (): string[] => {
  const origins = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  return origins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const resolveCorsOrigin = (origin: string | null): string => {
  const allowed = getAllowedOrigins();
  if (!origin) return allowed[0] ?? "*";
  if (allowed.length === 0) return "*";
  return allowed.includes(origin) ? origin : allowed[0];
};

export const buildCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": resolveCorsOrigin(origin),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
