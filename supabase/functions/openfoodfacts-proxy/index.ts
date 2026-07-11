import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OFF_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

async function getFatSecretToken() {
  const clientId = Deno.env.get('FATSECRET_CLIENT_ID');
  const clientSecret = Deno.env.get('FATSECRET_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  try {
    const auth = btoa(`${clientId}:${clientSecret}`);
    const response = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=basic',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.access_token;
  } catch (e) { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, query, productCode } = await req.json();
    console.log(`[Proxy] Action: ${action}, Query: ${query || productCode}`);

    if (action === 'search') {
      const fsToken = await getFatSecretToken();
      
      // 1. FatSecret (Sempre tenta primeiro se tiver token)
      let fsResults = [];
      if (fsToken) {
        try {
          const fsRes = await fetch(`https://platform.fatsecret.com/rest/server.api?method=foods.search.v3&search_expression=${encodeURIComponent(query)}&format=json`, {
            headers: { 'Authorization': `Bearer ${fsToken}` }
          });
          const fsData = await fsRes.json();
          const rawFs = fsData.foods_search?.results?.food;
          fsResults = (Array.isArray(rawFs) ? rawFs : rawFs ? [rawFs] : []).map(f => ({
            source: 'fatsecret',
            id: `fs_${f.food_id}`,
            name: f.food_name,
            brand: f.brand_name || 'Desconhecida',
            image: null
          }));
        } catch (e) { console.error('[FS] Error:', e.message); }
      }

      // 2. OpenFoodFacts Cascade Search
      let offResults = [];
      const offEndpoints = [
        `https://br.openfoodfacts.org/api/v2/search?q=${encodeURIComponent(query)}&fields=code,product_name,product_name_pt,product_name_en,brands,image_url&page_size=24&lc=pt`,
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=24&fields=product_name,product_name_pt,brands,code,image_url`,
      ];

      for (const url of offEndpoints) {
        if (offResults.length > 0) break;
        try {
          console.log(`[OFF] Trying: ${url}`);
          const res = await fetch(url, { headers: { 'User-Agent': OFF_USER_AGENT } });
          if (res.ok) {
            const data = await res.json();
            const products = data.products || [];
            offResults = products.map(p => ({
              source: 'openfoodfacts',
              id: p.code,
              name: p.product_name_pt || p.product_name || p.product_name_en || 'Produto sem nome',
              brand: p.brands || 'Desconhecida',
              image: p.image_url
            }));
          }
        } catch (e) { console.error(`[OFF] Error at ${url}:`, e.message); }
      }

      return new Response(JSON.stringify({
        results: [...fsResults, ...offResults],
        total: fsResults.length + offResults.length,
        timestamp: new Date().toISOString()
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- DETALHES DO PRODUTO ---
    if (action === 'product') {
      const source = productCode.startsWith('fs_') ? 'fatsecret' : 'openfoodfacts';
      const cleanId = productCode.replace('fs_', '');
      let resultData = null;

      if (source === 'fatsecret') {
        const token = await getFatSecretToken();
        const res = await fetch(`https://platform.fatsecret.com/rest/server.api?method=food.get.v4&food_id=${cleanId}&format=json`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        resultData = { source: 'fatsecret', data: data.food };
      } else {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanId}.json`, {
          headers: { 'User-Agent': OFF_USER_AGENT }
        });
        const data = await res.json();
        resultData = { source: 'openfoodfacts', data: data.product };
      }
      return new Response(JSON.stringify(resultData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
