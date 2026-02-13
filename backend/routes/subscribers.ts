type SubscribersRouteArgs = {
  req: Request;
  pathname: string;
  method: string;
  corsHeaders: Record<string, string>;
  verifyAccessKey: (req: Request) => boolean;
  addSubscriber: (email: string, name: string) => { success: true; message: string; subscribedAt: number };
  listSubscribers: () => any[];
  exportSubscribersCsv: () => string;
};

const jsonHeaders = (corsHeaders: Record<string, string>) => ({
  ...corsHeaders,
  'Content-Type': 'application/json',
});

export const handleSubscribersRoutes = async (args: SubscribersRouteArgs): Promise<Response | null> => {
  const {
    req,
    pathname,
    method,
    corsHeaders,
    verifyAccessKey,
    addSubscriber,
    listSubscribers,
    exportSubscribersCsv,
  } = args;

  if (pathname === '/api/subscribe' && method === 'POST') {
    const body = await req.json();
    const { email, name } = body;

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }

    try {
      addSubscriber(email, name || '');
      return new Response(JSON.stringify({ success: true, message: 'Subscribed successfully' }), { status: 201, headers: jsonHeaders(corsHeaders) });
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint failed')) {
        return new Response(JSON.stringify({ error: 'Email already subscribed' }), { status: 409, headers: jsonHeaders(corsHeaders) });
      }
      return new Response(JSON.stringify({ error: 'Failed to subscribe' }), { status: 500, headers: jsonHeaders(corsHeaders) });
    }
  }

  if (pathname === '/api/subscribers' && method === 'GET') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    return new Response(JSON.stringify(listSubscribers()), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/subscribers/export' && method === 'GET') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const csv = exportSubscribersCsv();
    return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="subscribers.csv"' } });
  }

  return null;
};
