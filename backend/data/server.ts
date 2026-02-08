import { serve } from 'bun';
import { join, basename, extname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Database } from 'bun:sqlite';

const PORT = parseInt(process.env.PORT || '3001');
const ACCESS_KEY = process.env.ACCESS_KEY || 'AFRO12';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Access-Key',
};

const dataDir = join(import.meta.dir, '.');
const uploadsDir = join(import.meta.dir, '..', 'uploads');
const storylinesFile = join(dataDir, 'storylines.json');

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
if (!existsSync(storylinesFile)) writeFileSync(storylinesFile, JSON.stringify([], null, 2));

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
  try { return JSON.parse(readFileSync(storylinesFile, 'utf8')); }
  catch { return []; }
};

const saveStorylines = (data: any) => {
  try { writeFileSync(storylinesFile, JSON.stringify(data, null, 2)); return true; }
  catch { return false; }
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

    if (pathname === '/api/storylines' && method === 'GET') {
      return new Response(JSON.stringify(loadStorylines()), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
console.log(`Database: ${DB_PATH}`);
