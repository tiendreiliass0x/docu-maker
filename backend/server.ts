import { serve } from 'bun';
import { join, basename, extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Database } from 'bun:sqlite';

const PORT = parseInt(process.env.PORT || '3001');
const ACCESS_KEY = process.env.ACCESS_KEY || 'AFRO12';
const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Access-Key, X-Admin-Key',
};

const dataDir = join(import.meta.dir, 'data');
const uploadsDir = join(import.meta.dir, 'uploads');

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

// Initialize SQLite database
const DB_PATH = join(dataDir, 'anecdotes.db');
const db = new Database(DB_PATH);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS anecdotes (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    year INTEGER NOT NULL,
    title TEXT NOT NULL,
    story TEXT NOT NULL,
    storyteller TEXT NOT NULL,
    location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    anecdoteId TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    caption TEXT DEFAULT '',
    createdAt INTEGER NOT NULL,
    FOREIGN KEY (anecdoteId) REFERENCES anecdotes(id) ON DELETE CASCADE
  )
`);

// Create subscribers table
db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    subscribedAt INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS storylines_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);

const generateId = (): string => crypto.randomUUID();

const getContentType = (ext: string): string => {
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
};

const verifyAccessKey = (req: Request): boolean => {
  const key = req.headers.get('x-access-key') || new URL(req.url).searchParams.get('key');
  return key === ACCESS_KEY;
};

const verifyAdminKey = (req: Request): boolean => {
  if (!ADMIN_ACCESS_KEY) return false;
  const key = req.headers.get('x-admin-key') || new URL(req.url).searchParams.get('adminKey');
  return key === ADMIN_ACCESS_KEY;
};

const parseMultipart = async (req: Request): Promise<{ fields: Record<string, string>; files: { name: string; data: Uint8Array; filename: string; type: string }[] }> => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return { fields: {}, files: [] };

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) return { fields: {}, files: [] };

  const body = await req.arrayBuffer();
  const decoder = new TextDecoder();
  const data = new Uint8Array(body);
  const fields: Record<string, string> = {};
  const files: { name: string; data: Uint8Array; filename: string; type: string }[] = [];
  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
  let start = 0;

  const findBoundary = (data: Uint8Array, boundary: Uint8Array, start: number): number => {
    for (let i = start; i <= data.length - boundary.length; i++) {
      let match = true;
      for (let j = 0; j < boundary.length; j++) {
        if (data[i + j] !== boundary[j]) { match = false; break; }
      }
      if (match) return i;
    }
    return -1;
  };

  while (true) {
    const boundaryIndex = findBoundary(data, boundaryBytes, start);
    if (boundaryIndex === -1) break;
    const nextBoundaryIndex = findBoundary(data, boundaryBytes, boundaryIndex + boundaryBytes.length);
    if (nextBoundaryIndex === -1) break;

    const part = data.slice(boundaryIndex + boundaryBytes.length, nextBoundaryIndex);
    const partStr = decoder.decode(part);
    const headerEnd = partStr.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = nextBoundaryIndex; continue; }

    const headers = partStr.slice(0, headerEnd);
    const contentStart = headerEnd + 4;
    const content = part.slice(contentStart, part.length - 2);

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);

    if (filenameMatch && nameMatch) {
      files.push({ name: nameMatch[1], filename: filenameMatch[1], data: content, type: typeMatch?.[1] || 'application/octet-stream' });
    } else if (nameMatch) {
      fields[nameMatch[1]] = decoder.decode(content);
    }
    start = nextBoundaryIndex;
  }
  return { fields, files };
};

// Database helpers
const getAllAnecdotes = () => {
  const anecdotes = db.query('SELECT * FROM anecdotes ORDER BY year DESC, date DESC').all() as any[];
  return anecdotes.map(a => ({
    ...a,
    tags: JSON.parse(a.tags || '[]'),
    media: db.query('SELECT * FROM media WHERE anecdoteId = ?').all(a.id) as any[]
  }));
};

const getAnecdoteById = (id: string) => {
  const a = db.query('SELECT * FROM anecdotes WHERE id = ?').get(id) as any;
  if (!a) return null;
  return {
    ...a,
    tags: JSON.parse(a.tags || '[]'),
    media: db.query('SELECT * FROM media WHERE anecdoteId = ?').all(id) as any[]
  };
};

const getAnecdotesByYear = (year: number) => {
  const anecdotes = db.query('SELECT * FROM anecdotes WHERE year = ? ORDER BY date DESC').all(year) as any[];
  return anecdotes.map(a => ({
    ...a,
    tags: JSON.parse(a.tags || '[]'),
    media: db.query('SELECT * FROM media WHERE anecdoteId = ?').all(a.id) as any[]
  }));
};

const loadStorylines = () => {
  const row = db.query('SELECT payload FROM storylines_cache WHERE id = 1').get() as { payload?: string } | null;
  if (!row?.payload) return [];
  try { return JSON.parse(row.payload); }
  catch { return []; }
};

const saveStorylines = (data: any) => {
  try {
    db.query(`
      INSERT INTO storylines_cache (id, payload, updatedAt)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt
    `).run(JSON.stringify(data), Date.now());
    return true;
  }
  catch { return false; }
};

const buildStorylineContext = (storyline: any) => ({
  id: storyline.id,
  title: storyline.title,
  description: storyline.description,
  style: storyline.style,
  tone: storyline.tone,
  openingLine: storyline.openingLine,
  closingLine: storyline.closingLine,
  timeframe: storyline.timeframe,
  tags: Array.isArray(storyline.tags) ? storyline.tags.slice(0, 12) : [],
  beats: Array.isArray(storyline.beats)
    ? storyline.beats.map((beat: any, index: number) => ({
      order: index + 1,
      beatId: beat.id,
      intensity: beat.intensity,
      summary: beat.summary,
      voiceover: beat.voiceover,
      connection: beat.connection,
      anecdote: {
        id: beat.anecdote?.id,
        date: beat.anecdote?.date,
        year: beat.anecdote?.year,
        title: beat.anecdote?.title,
        story: beat.anecdote?.story,
        storyteller: beat.anecdote?.storyteller,
        location: beat.anecdote?.location,
        tags: beat.anecdote?.tags || [],
      },
    }))
    : [],
});

const generateStoryPackage = async (storyline: any, prompt: string) => {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['writeup', 'storyboard', 'extras'],
    properties: {
      writeup: {
        type: 'object',
        additionalProperties: false,
        required: ['headline', 'deck', 'narrative'],
        properties: {
          headline: { type: 'string' },
          deck: { type: 'string' },
          narrative: { type: 'string' },
        },
      },
      storyboard: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sceneNumber', 'beatId', 'slugline', 'visualDirection', 'camera', 'audio', 'voiceover', 'onScreenText', 'transition', 'durationSeconds'],
          properties: {
            sceneNumber: { type: 'number' },
            beatId: { type: 'string' },
            slugline: { type: 'string' },
            visualDirection: { type: 'string' },
            camera: { type: 'string' },
            audio: { type: 'string' },
            voiceover: { type: 'string' },
            onScreenText: { type: 'string' },
            transition: { type: 'string' },
            durationSeconds: { type: 'number' },
          },
        },
      },
      extras: {
        type: 'object',
        additionalProperties: false,
        required: ['logline', 'socialCaption', 'pullQuotes'],
        properties: {
          logline: { type: 'string' },
          socialCaption: { type: 'string' },
          pullQuotes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'You are a documentary writer and storyboard artist. Use only facts from context. Do not invent missing facts; use UNKNOWN. Keep chronology aligned with beat order. Return strict JSON only.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            prompt: prompt || 'Create a compelling documentary write-up and production-ready storyboard.',
            storyline: buildStorylineContext(storyline),
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'story_package',
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await response.json().catch(() => null as any);
  if (!response.ok) throw new Error(data?.error?.message || 'LLM request failed');
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM response missing content');
  try { return JSON.parse(content); }
  catch { throw new Error('LLM returned invalid JSON'); }
};

const validateStorylinesPayload = (storylines: any): string[] => {
  const errors: string[] = [];
  if (!Array.isArray(storylines)) {
    errors.push('storylines must be an array');
    return errors;
  }

  const isString = (value: any) => typeof value === 'string';
  const isNumber = (value: any) => typeof value === 'number' && Number.isFinite(value);
  const pushError = (path: string, message: string) => {
    if (errors.length < 40) errors.push(`${path}: ${message}`);
  };

  storylines.forEach((line: any, lineIndex: number) => {
    const linePath = `storylines[${lineIndex}]`;
    if (!line || typeof line !== 'object') {
      pushError(linePath, 'must be an object');
      return;
    }

    const requiredStringFields = ['id', 'title', 'description', 'style', 'tone', 'openingLine', 'closingLine'];
    requiredStringFields.forEach(field => {
      if (!isString(line[field])) pushError(`${linePath}.${field}`, 'must be a string');
    });

    if (!Array.isArray(line.tags)) pushError(`${linePath}.tags`, 'must be an array');
    if (!Array.isArray(line.beats)) pushError(`${linePath}.beats`, 'must be an array');

    if (!line.timeframe || typeof line.timeframe !== 'object') {
      pushError(`${linePath}.timeframe`, 'must be an object');
    } else {
      if (!isString(line.timeframe.start)) pushError(`${linePath}.timeframe.start`, 'must be a string');
      if (!isString(line.timeframe.end)) pushError(`${linePath}.timeframe.end`, 'must be a string');
      if (!Array.isArray(line.timeframe.years)) {
        pushError(`${linePath}.timeframe.years`, 'must be an array');
      } else {
        line.timeframe.years.forEach((year: any, yearIndex: number) => {
          if (!isNumber(year)) pushError(`${linePath}.timeframe.years[${yearIndex}]`, 'must be a number');
        });
      }
    }

    if (!Array.isArray(line.beats)) return;

    line.beats.forEach((beat: any, beatIndex: number) => {
      const beatPath = `${linePath}.beats[${beatIndex}]`;
      if (!beat || typeof beat !== 'object') {
        pushError(beatPath, 'must be an object');
        return;
      }

      ['id', 'summary', 'voiceover'].forEach(field => {
        if (!isString(beat[field])) pushError(`${beatPath}.${field}`, 'must be a string');
      });
      if (!isNumber(beat.intensity)) pushError(`${beatPath}.intensity`, 'must be a number');

      if (!beat.anecdote || typeof beat.anecdote !== 'object') {
        pushError(`${beatPath}.anecdote`, 'must be an object');
      } else if (!isString(beat.anecdote.id)) {
        pushError(`${beatPath}.anecdote.id`, 'must be a string');
      }

      if (beat.connection != null) {
        if (!beat.connection || typeof beat.connection !== 'object') {
          pushError(`${beatPath}.connection`, 'must be an object or null');
        } else {
          if (!isString(beat.connection.type)) pushError(`${beatPath}.connection.type`, 'must be a string');
          if (!isString(beat.connection.label)) pushError(`${beatPath}.connection.label`, 'must be a string');
        }
      }
    });
  });

  return errors;
};

const createAnecdote = (data: any) => {
  const id = generateId();
  const now = Date.now();
  db.query(`
    INSERT INTO anecdotes (id, date, year, title, story, storyteller, location, notes, tags, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.date, data.year, data.title, data.story, data.storyteller, data.location || '', data.notes || '', JSON.stringify(data.tags || []), now, now);
  
  // Insert media
  if (data.media && data.media.length > 0) {
    for (const m of data.media) {
      db.query('INSERT INTO media (id, anecdoteId, type, url, caption, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(generateId(), id, m.type, m.url, m.caption || '', now);
    }
  }
  
  return getAnecdoteById(id);
};

const updateAnecdote = (id: string, data: any) => {
  const existing = getAnecdoteById(id);
  if (!existing) return null;
  
  const now = Date.now();
  db.query(`
    UPDATE anecdotes SET
      date = COALESCE(?, date),
      year = COALESCE(?, year),
      title = COALESCE(?, title),
      story = COALESCE(?, story),
      storyteller = COALESCE(?, storyteller),
      location = COALESCE(?, location),
      notes = COALESCE(?, notes),
      tags = COALESCE(?, tags),
      updatedAt = ?
    WHERE id = ?
  `).run(
    data.date,
    data.year,
    data.title,
    data.story,
    data.storyteller,
    data.location,
    data.notes,
    data.tags ? JSON.stringify(data.tags) : null,
    now,
    id
  );
  
  // Update media if provided
  if (data.media) {
    db.query('DELETE FROM media WHERE anecdoteId = ?').run(id);
    for (const m of data.media) {
      db.query('INSERT INTO media (id, anecdoteId, type, url, caption, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(generateId(), id, m.type, m.url, m.caption || '', now);
    }
  }
  
  return getAnecdoteById(id);
};

const deleteAnecdote = (id: string) => {
  // Get media to delete files
  const media = db.query('SELECT url FROM media WHERE anecdoteId = ?').all(id) as any[];
  for (const m of media) {
    if (m.url && m.url.startsWith('/uploads/')) {
      const fp = join(uploadsDir, basename(m.url));
      if (existsSync(fp)) {
        const file = Bun.file(fp);
        file.delete?.();
      }
    }
  }
  
  db.query('DELETE FROM anecdotes WHERE id = ?').run(id);
  return true;
};

const getDbStats = () => {
  const anecdotes = (db.query('SELECT COUNT(*) as count FROM anecdotes').get() as { count: number }).count;
  const media = (db.query('SELECT COUNT(*) as count FROM media').get() as { count: number }).count;
  const subscribers = (db.query('SELECT COUNT(*) as count FROM subscribers').get() as { count: number }).count;
  const storylineRow = db.query('SELECT payload, updatedAt FROM storylines_cache WHERE id = 1').get() as { payload?: string; updatedAt?: number } | null;

  let storylines = 0;
  if (storylineRow?.payload) {
    try {
      const parsed = JSON.parse(storylineRow.payload);
      storylines = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      storylines = 0;
    }
  }

  return {
    anecdotes,
    media,
    subscribers,
    storylines,
    storylinesUpdatedAt: storylineRow?.updatedAt || null,
  };
};

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });

    if (pathname.startsWith('/uploads/')) {
      const filename = basename(pathname);
      const filePath = join(uploadsDir, filename);
      if (existsSync(filePath)) {
        const ext = extname(filename).toLowerCase();
        const file = Bun.file(filePath);
        return new Response(file, { headers: { ...corsHeaders, 'Content-Type': getContentType(ext) } });
      }
      return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/upload' && method === 'POST') {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { files } = await parseMultipart(req);
      const imageFile = files.find(f => ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extname(f.filename).toLowerCase()));
      if (!imageFile) return new Response(JSON.stringify({ error: 'No valid image uploaded' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${extname(imageFile.filename)}`;
      const filePath = join(uploadsDir, uniqueName);
      await Bun.write(filePath, imageFile.data);
      return new Response(JSON.stringify({ success: true, url: `/uploads/${uniqueName}`, filename: uniqueName }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/anecdotes' && method === 'GET') {
      return new Response(JSON.stringify(getAllAnecdotes()), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/health' && method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (pathname === '/api/admin/db-stats' && method === 'GET') {
      if (!verifyAdminKey(req)) return new Response(JSON.stringify({ error: 'Admin key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(getDbStats()), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/storylines' && method === 'GET') {
      return new Response(JSON.stringify(loadStorylines()), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/storylines/generate' && method === 'POST') {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const body = await req.json();
      const storyline = body.storyline;
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      if (!storyline || typeof storyline !== 'object' || !Array.isArray(storyline.beats) || !storyline.beats.length) {
        return new Response(JSON.stringify({ error: 'Valid storyline payload is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        const result = await generateStoryPackage(storyline, prompt);
        return new Response(JSON.stringify({ success: true, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate story package';
        return new Response(JSON.stringify({ error: message }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (pathname.match(/^\/api\/anecdotes\/year\/\d+$/) && method === 'GET') {
      const year = parseInt(pathname.split('/').pop()!);
      return new Response(JSON.stringify(getAnecdotesByYear(year)), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'GET' && !pathname.includes('/year/')) {
      const id = pathname.split('/').pop()!;
      const anecdote = getAnecdoteById(id);
      if (!anecdote) return new Response(JSON.stringify({ error: 'Anecdote not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(anecdote), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/anecdotes' && method === 'POST') {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const body = await req.json();
      const { date, year, title, story, storyteller, location, notes, media, tags } = body;
      if (!date || !year || !title || !story || !storyteller) return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const newAnecdote = createAnecdote({ date, year: parseInt(year), title, story, storyteller, location, notes, media, tags });
      return new Response(JSON.stringify(newAnecdote), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/storylines' && method === 'POST') {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const body = await req.json();
      const storylines = Array.isArray(body) ? body : body.storylines;
      if (!Array.isArray(storylines)) return new Response(JSON.stringify({ error: 'Invalid storylines payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const validationErrors = validateStorylinesPayload(storylines);
      if (validationErrors.length) {
        return new Response(JSON.stringify({ error: 'Malformed storyline data', details: validationErrors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const success = saveStorylines(storylines);
      if (!success) return new Response(JSON.stringify({ error: 'Failed to save storylines' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ success: true, count: storylines.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'PUT' && !pathname.includes('/year/')) {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const id = pathname.split('/').pop()!;
      const body = await req.json();
      const updated = updateAnecdote(id, body);
      if (!updated) return new Response(JSON.stringify({ error: 'Anecdote not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(updated), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'DELETE' && !pathname.includes('/year/')) {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const id = pathname.split('/').pop()!;
      const existing = getAnecdoteById(id);
      if (!existing) return new Response(JSON.stringify({ error: 'Anecdote not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      deleteAnecdote(id);
      return new Response(JSON.stringify({ success: true, message: 'Anecdote deleted' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/graph' && method === 'GET') {
      const anecdotes = getAllAnecdotes();
      const nodes: any[] = [];
      const links: any[] = [];
      const years = [...new Set(anecdotes.map((a: any) => a.year))].sort((a, b) => a - b);
      years.forEach(year => nodes.push({ id: `year-${year}`, type: 'year', label: year.toString(), year }));
      const storytellers = [...new Set(anecdotes.map((a: any) => a.storyteller))];
      storytellers.forEach(s => {
        const id = `storyteller-${s.replace(/\s+/g, '-')}`;
        nodes.push({ id, type: 'storyteller', label: s, storyteller: s });
        [...new Set(anecdotes.filter((a: any) => a.storyteller === s).map((a: any) => a.year))].forEach(year => {
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
            if (!nodes.find(n => n.id === tagId)) nodes.push({ id: tagId, type: 'tag', label: tag });
            links.push({ source: id, target: tagId, type: 'story-tag' });
          });
        }
      });
      return new Response(JSON.stringify({ nodes, links }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/verify-key' && method === 'POST') {
      const body = await req.json();
      const { key } = body;
      if (!key) return new Response(JSON.stringify({ valid: false, error: 'Key required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (key === ACCESS_KEY) return new Response(JSON.stringify({ valid: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ valid: false, error: 'Invalid key' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Subscriber endpoints
    if (pathname === '/api/subscribe' && method === 'POST') {
      const body = await req.json();
      const { email, name } = body;
      
      if (!email || !email.includes('@')) {
        return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      try {
        db.query('INSERT INTO subscribers (id, email, name, subscribedAt) VALUES (?, ?, ?, ?)')
          .run(generateId(), email.toLowerCase().trim(), name || '', Date.now());
        return new Response(JSON.stringify({ success: true, message: 'Subscribed successfully' }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err: any) {
        if (err.message?.includes('UNIQUE constraint failed')) {
          return new Response(JSON.stringify({ error: 'Email already subscribed' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: 'Failed to subscribe' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (pathname === '/api/subscribers' && method === 'GET') {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const subscribers = db.query('SELECT email, name, subscribedAt FROM subscribers ORDER BY subscribedAt DESC').all();
      return new Response(JSON.stringify(subscribers), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pathname === '/api/subscribers/export' && method === 'GET') {
      if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const subscribers = db.query('SELECT email, name, subscribedAt FROM subscribers ORDER BY subscribedAt DESC').all() as any[];
      const csv = ['Email,Name,Subscribed At', ...subscribers.map(s => `${s.email},"${s.name || ''}",${new Date(s.subscribedAt).toISOString()}`)].join('\n');
      return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="subscribers.csv"' } });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  },
});

console.log(`Server running on port ${PORT}`);
console.log(`Access key: ${ACCESS_KEY}`);
console.log(`Admin key configured: ${ADMIN_ACCESS_KEY ? 'yes' : 'no'}`);
console.log(`Database: ${DB_PATH}`);
