type AnecdotesRouteArgs = {
  req: Request;
  pathname: string;
  method: string;
  corsHeaders: Record<string, string>;
  verifyAccessKey: (req: Request) => boolean;
  getAllAnecdotes: () => any[];
  getAnecdoteById: (id: string) => any;
  getAnecdotesByYear: (year: number) => any[];
  createAnecdote: (data: any) => any;
  updateAnecdote: (id: string, data: any) => any;
  deleteAnecdote: (id: string) => boolean;
};

const jsonHeaders = (corsHeaders: Record<string, string>) => ({
  ...corsHeaders,
  'Content-Type': 'application/json',
});

export const handleAnecdotesRoutes = async (args: AnecdotesRouteArgs): Promise<Response | null> => {
  const {
    req,
    pathname,
    method,
    corsHeaders,
    verifyAccessKey,
    getAllAnecdotes,
    getAnecdoteById,
    getAnecdotesByYear,
    createAnecdote,
    updateAnecdote,
    deleteAnecdote,
  } = args;

  if (pathname === '/api/anecdotes' && method === 'GET') {
    return new Response(JSON.stringify(getAllAnecdotes()), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/anecdotes\/year\/\d+$/) && method === 'GET') {
    const year = parseInt(pathname.split('/').pop()!);
    return new Response(JSON.stringify(getAnecdotesByYear(year)), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'GET' && !pathname.includes('/year/')) {
    const id = pathname.split('/').pop()!;
    const anecdote = getAnecdoteById(id);
    if (!anecdote) {
      return new Response(JSON.stringify({ error: 'Anecdote not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
    }
    return new Response(JSON.stringify(anecdote), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/anecdotes' && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const body = await req.json();
    const { date, year, title, story, storyteller, location, notes, media, tags } = body;
    if (!date || !year || !title || !story || !storyteller) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }
    const newAnecdote = createAnecdote({ date, year: parseInt(year), title, story, storyteller, location, notes, media, tags });
    return new Response(JSON.stringify(newAnecdote), { status: 201, headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'PUT' && !pathname.includes('/year/')) {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const id = pathname.split('/').pop()!;
    const body = await req.json();
    const updated = updateAnecdote(id, body);
    if (!updated) {
      return new Response(JSON.stringify({ error: 'Anecdote not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
    }
    return new Response(JSON.stringify(updated), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'DELETE' && !pathname.includes('/year/')) {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const id = pathname.split('/').pop()!;
    const existing = getAnecdoteById(id);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Anecdote not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
    }
    deleteAnecdote(id);
    return new Response(JSON.stringify({ success: true, message: 'Anecdote deleted' }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/graph' && method === 'GET') {
    const anecdotes = getAllAnecdotes();
    const nodes: any[] = [];
    const links: any[] = [];
    const years = [...new Set(anecdotes.map((a: any) => a.year))].sort((a, b) => a - b);
    years.forEach(year => nodes.push({ id: `year-${year}`, type: 'year', label: year.toString(), year }));

    const storytellers = [...new Set(anecdotes.map((a: any) => a.storyteller))];
    storytellers.forEach(storyteller => {
      const id = `storyteller-${storyteller.replace(/\s+/g, '-')}`;
      nodes.push({ id, type: 'storyteller', label: storyteller, storyteller });
      [...new Set(anecdotes.filter((a: any) => a.storyteller === storyteller).map((a: any) => a.year))].forEach(year => {
        links.push({ source: id, target: `year-${year}`, type: 'storyteller-year' });
      });
    });

    anecdotes.forEach((story: any) => {
      const id = `story-${story.id}`;
      nodes.push({ id, type: 'story', label: story.title, storyId: story.id, year: story.year, storyteller: story.storyteller, anecdote: story });
      links.push({ source: id, target: `year-${story.year}`, type: 'story-year' });
      links.push({ source: id, target: `storyteller-${story.storyteller.replace(/\s+/g, '-')}`, type: 'story-storyteller' });
      if (story.tags && story.tags.length > 0) {
        story.tags.forEach((tag: string) => {
          const tagId = `tag-${tag}`;
          if (!nodes.find(node => node.id === tagId)) nodes.push({ id: tagId, type: 'tag', label: tag });
          links.push({ source: id, target: tagId, type: 'story-tag' });
        });
      }
    });

    return new Response(JSON.stringify({ nodes, links }), { headers: jsonHeaders(corsHeaders) });
  }

  return null;
};
