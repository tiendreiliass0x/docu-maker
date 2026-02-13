type StorylinesRouteArgs = {
  req: Request;
  pathname: string;
  method: string;
  url: URL;
  corsHeaders: Record<string, string>;
  verifyAccessKey: (req: Request) => boolean;
  loadStorylines: () => any[];
  saveStorylines: (data: any) => boolean;
  validateStorylinesPayload: (storylines: any) => string[];
  generateStoryPackage: (storyline: any, prompt: string) => Promise<any>;
  generateStoryboardScene: (storyline: any, scene: any, prompt: string) => Promise<any>;
  listStorylinePackages: (storylineId: string) => any[];
  getLatestStorylinePackage: (storylineId: string) => any;
  saveStorylinePackage: (storylineId: string, payload: any, prompt: string, status?: string) => any;
};

const jsonHeaders = (corsHeaders: Record<string, string>) => ({
  ...corsHeaders,
  'Content-Type': 'application/json',
});

export const handleStorylinesRoutes = async (args: StorylinesRouteArgs): Promise<Response | null> => {
  const {
    req,
    pathname,
    method,
    url,
    corsHeaders,
    verifyAccessKey,
    loadStorylines,
    saveStorylines,
    validateStorylinesPayload,
    generateStoryPackage,
    generateStoryboardScene,
    listStorylinePackages,
    getLatestStorylinePackage,
    saveStorylinePackage,
  } = args;

  if (pathname === '/api/storylines' && method === 'GET') {
    return new Response(JSON.stringify(loadStorylines()), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/storylines/generate' && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const body = await req.json();
    const storyline = body.storyline;
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!storyline || typeof storyline !== 'object' || !Array.isArray(storyline.beats) || !storyline.beats.length) {
      return new Response(JSON.stringify({ error: 'Valid storyline payload is required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }

    try {
      const result = await generateStoryPackage(storyline, prompt);
      const storylineId = String(storyline.id || 'unknown-storyline');
      const saved = saveStorylinePackage(storylineId, result, prompt, 'draft');
      return new Response(JSON.stringify({ success: true, result, package: saved }), { headers: jsonHeaders(corsHeaders) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate story package';
      return new Response(JSON.stringify({ error: message }), { status: 502, headers: jsonHeaders(corsHeaders) });
    }
  }

  if (pathname === '/api/storylines/scene/regenerate' && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const body = await req.json();
    const storyline = body.storyline;
    const scene = body.scene;
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';

    if (!storyline || !scene || typeof scene !== 'object') {
      return new Response(JSON.stringify({ error: 'storyline and scene are required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }

    try {
      const regeneratedScene = await generateStoryboardScene(storyline, scene, prompt);
      return new Response(JSON.stringify({ success: true, scene: regeneratedScene }), { headers: jsonHeaders(corsHeaders) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to regenerate scene';
      return new Response(JSON.stringify({ error: message }), { status: 502, headers: jsonHeaders(corsHeaders) });
    }
  }

  if (pathname === '/api/storylines/packages' && method === 'GET') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const storylineId = url.searchParams.get('storylineId');
    if (!storylineId) return new Response(JSON.stringify({ error: 'storylineId is required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    return new Response(JSON.stringify({ items: listStorylinePackages(storylineId) }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/storylines/package' && method === 'GET') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const storylineId = url.searchParams.get('storylineId');
    if (!storylineId) return new Response(JSON.stringify({ error: 'storylineId is required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    const item = getLatestStorylinePackage(storylineId);
    return new Response(JSON.stringify({ item }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/storylines/package' && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const body = await req.json();
    const storylineId = String(body.storylineId || '');
    const payload = body.payload;
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const status = typeof body.status === 'string' ? body.status : 'draft';

    if (!storylineId || !payload || typeof payload !== 'object') {
      return new Response(JSON.stringify({ error: 'storylineId and payload are required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }

    try {
      const item = saveStorylinePackage(storylineId, payload, prompt, status);
      return new Response(JSON.stringify({ success: true, item }), { headers: jsonHeaders(corsHeaders) });
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to save storyline package' }), { status: 500, headers: jsonHeaders(corsHeaders) });
    }
  }

  if (pathname === '/api/storylines' && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const body = await req.json();
    const storylines = Array.isArray(body) ? body : body.storylines;
    if (!Array.isArray(storylines)) return new Response(JSON.stringify({ error: 'Invalid storylines payload' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    const validationErrors = validateStorylinesPayload(storylines);
    if (validationErrors.length) {
      return new Response(JSON.stringify({ error: 'Malformed storyline data', details: validationErrors }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }
    const success = saveStorylines(storylines);
    if (!success) return new Response(JSON.stringify({ error: 'Failed to save storylines' }), { status: 500, headers: jsonHeaders(corsHeaders) });
    return new Response(JSON.stringify({ success: true, count: storylines.length }), { headers: jsonHeaders(corsHeaders) });
  }

  return null;
};
