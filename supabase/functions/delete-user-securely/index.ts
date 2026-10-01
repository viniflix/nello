import { edgeBoundary } from '../_shared/http.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {};

Deno.serve(edgeBoundary((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    error: "A exclusão permanente foi desativada. Use a remoção segura de cadastro vazio.",
    code: "PERMANENT_DELETION_DISABLED",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));
