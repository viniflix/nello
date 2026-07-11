const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const sentryToken = Deno.env.get('SENTRY_AUTH_TOKEN');
    
    if (!sentryToken) {
      throw new Error('SENTRY_AUTH_TOKEN not configured in environment variables');
    }

    const url = 'https://sentry.io/api/0/projects/nello/javascript-react/issues/?statsPeriod=14d';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sentryToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Sentry API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const issues = data.map((issue: any) => ({
      id: issue.id,
      shortId: issue.shortId,
      title: issue.title,
      culprit: issue.culprit,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      count: issue.count,
      userCount: issue.userCount,
      level: issue.level,
      status: issue.status,
      permalink: issue.permalink,
      type: issue.type,
      metadata: issue.metadata
    }));

    return new Response(JSON.stringify(issues), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error fetching Sentry issues:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
