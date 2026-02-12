const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PORT = parseInt(process.env.PORT || '3001');
const ACCESS_KEY = process.env.ACCESS_KEY || 'AFRO12';

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Data files
const ANECDOTES_FILE = path.join(dataDir, 'anecdotes.json');
const SUBSCRIBERS_FILE = path.join(dataDir, 'subscribers.json');
const STORYLINES_FILE = path.join(dataDir, 'storylines.json');

// Initialize files if they don't exist
if (!fs.existsSync(ANECDOTES_FILE)) fs.writeFileSync(ANECDOTES_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(SUBSCRIBERS_FILE)) fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(STORYLINES_FILE)) fs.writeFileSync(STORYLINES_FILE, JSON.stringify([], null, 2));

const generateId = () => crypto.randomUUID();

const getContentType = (ext) => {
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Access-Key',
};

// Data helpers
const loadAnecdotes = () => {
  try { return JSON.parse(fs.readFileSync(ANECDOTES_FILE, 'utf8')); }
  catch { return []; }
};

const saveAnecdotes = (data) => {
  try { fs.writeFileSync(ANECDOTES_FILE, JSON.stringify(data, null, 2)); return true; }
  catch { return false; }
};

const loadSubscribers = () => {
  try { return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8')); }
  catch { return []; }
};

const saveSubscribers = (data) => {
  try { fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2)); return true; }
  catch { return false; }
};

const loadStorylines = () => {
  try { return JSON.parse(fs.readFileSync(STORYLINES_FILE, 'utf8')); }
  catch { return []; }
};

const saveStorylines = (data) => {
  try { fs.writeFileSync(STORYLINES_FILE, JSON.stringify(data, null, 2)); return true; }
  catch { return false; }
};

// Parse multipart form data
const parseMultipart = async (req) => {
  return new Promise((resolve) => {
    let body = Buffer.alloc(0);
    req.on('data', chunk => body = Buffer.concat([body, chunk]));
    req.on('end', () => {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('multipart/form-data')) {
        resolve({ fields: {}, files: [] });
        return;
      }
      
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) {
        resolve({ fields: {}, files: [] });
        return;
      }
      
      const fields = {};
      const files = [];
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      let start = 0;
      
      while (true) {
        const boundaryIndex = body.indexOf(boundaryBuffer, start);
        if (boundaryIndex === -1) break;
        const nextBoundaryIndex = body.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
        if (nextBoundaryIndex === -1) break;
        
        const part = body.slice(boundaryIndex + boundaryBuffer.length, nextBoundaryIndex);
        const partStr = part.toString('utf8');
        const headerEnd = partStr.indexOf('\r\n\r\n');
        if (headerEnd === -1) { start = nextBoundaryIndex; continue; }
        
        const headers = partStr.slice(0, headerEnd);
        const contentStart = headerEnd + 4;
        const content = part.slice(contentStart, part.length - 2);
        
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        
        if (filenameMatch && nameMatch) {
          files.push({ name: nameMatch[1], filename: filenameMatch[1], data: content });
        } else if (nameMatch) {
          fields[nameMatch[1]] = content.toString('utf8');
        }
        start = nextBoundaryIndex;
      }
      
      resolve({ fields, files });
    });
  });
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Content-Type', 'application/json');
  
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Verify access key helper
  const verifyAccessKey = () => {
    const key = req.headers['x-access-key'] || parsedUrl.query.key;
    return key === ACCESS_KEY;
  };
  
  // Parse JSON body helper
  const parseBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
  
  // Routes
  try {
    // Static files
    if (pathname.startsWith('/uploads/')) {
      const filename = path.basename(pathname);
      const filePath = path.join(uploadsDir, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filename).toLowerCase();
        res.setHeader('Content-Type', getContentType(ext));
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    
    if (pathname === '/api/upload' && method === 'POST') {
      if (!verifyAccessKey()) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Access key required' }));
        return;
      }
      
      const { files } = await parseMultipart(req);
      const imageFile = files.find(f => ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(f.filename).toLowerCase()));
      if (!imageFile) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'No valid image uploaded' }));
        return;
      }
      
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}${path.extname(imageFile.filename)}`;
      const filePath = path.join(uploadsDir, uniqueName);
      fs.writeFileSync(filePath, imageFile.data);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, url: `/uploads/${uniqueName}`, filename: uniqueName }));
      return;
    }
    
    if (pathname === '/api/anecdotes' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(loadAnecdotes()));
      return;
    }

    if (pathname === '/api/health' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    if (pathname === '/api/storylines' && method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(loadStorylines()));
      return;
    }
    
    if (pathname.match(/^\/api\/anecdotes\/year\/\d+$/) && method === 'GET') {
      const year = parseInt(pathname.split('/').pop());
      const anecdotes = loadAnecdotes().filter(a => a.year === year);
      res.writeHead(200);
      res.end(JSON.stringify(anecdotes));
      return;
    }
    
    if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'GET' && !pathname.includes('/year/')) {
      const id = pathname.split('/').pop();
      const anecdote = loadAnecdotes().find(a => a.id === id);
      if (!anecdote) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Anecdote not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(anecdote));
      return;
    }
    
    if (pathname === '/api/anecdotes' && method === 'POST') {
      if (!verifyAccessKey()) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Access key required' }));
        return;
      }
      const body = await parseBody();
      const { date, year, title, story, storyteller, location, notes, media, tags } = body;
      if (!date || !year || !title || !story || !storyteller) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return;
      }
      const anecdotes = loadAnecdotes();
      const newAnecdote = {
        id: generateId(),
        date,
        year: parseInt(year),
        title,
        story,
        storyteller,
        location: location || '',
        notes: notes || '',
        media: media || [],
        tags: tags || [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      anecdotes.push(newAnecdote);
      saveAnecdotes(anecdotes);
      res.writeHead(201);
      res.end(JSON.stringify(newAnecdote));
      return;
    }

    if (pathname === '/api/storylines' && method === 'POST') {
      if (!verifyAccessKey()) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Access key required' }));
        return;
      }

      const body = await parseBody();
      const storylines = Array.isArray(body) ? body : body.storylines;
      if (!Array.isArray(storylines)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid storylines payload' }));
        return;
      }

      const success = saveStorylines(storylines);
      if (!success) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to save storylines' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, count: storylines.length }));
      return;
    }
    
    if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'PUT' && !pathname.includes('/year/')) {
      if (!verifyAccessKey()) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Access key required' }));
        return;
      }
      const id = pathname.split('/').pop();
      const body = await parseBody();
      const anecdotes = loadAnecdotes();
      const index = anecdotes.findIndex(a => a.id === id);
      if (index === -1) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Anecdote not found' }));
        return;
      }
      anecdotes[index] = {
        ...anecdotes[index],
        date: body.date || anecdotes[index].date,
        year: body.year ? parseInt(body.year) : anecdotes[index].year,
        title: body.title || anecdotes[index].title,
        story: body.story || anecdotes[index].story,
        storyteller: body.storyteller || anecdotes[index].storyteller,
        location: body.location !== undefined ? body.location : anecdotes[index].location,
        notes: body.notes !== undefined ? body.notes : anecdotes[index].notes,
        media: body.media || anecdotes[index].media,
        tags: body.tags || anecdotes[index].tags,
        updatedAt: Date.now()
      };
      saveAnecdotes(anecdotes);
      res.writeHead(200);
      res.end(JSON.stringify(anecdotes[index]));
      return;
    }
    
    if (pathname.match(/^\/api\/anecdotes\/[^/]+$/) && method === 'DELETE' && !pathname.includes('/year/')) {
      if (!verifyAccessKey()) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Access key required' }));
        return;
      }
      const id = pathname.split('/').pop();
      const anecdotes = loadAnecdotes();
      const index = anecdotes.findIndex(a => a.id === id);
      if (index === -1) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Anecdote not found' }));
        return;
      }
      const deleted = anecdotes[index];
      if (deleted.media) {
        deleted.media.forEach(m => {
          if (m.url && m.url.startsWith('/uploads/')) {
            const fp = path.join(uploadsDir, path.basename(m.url));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          }
        });
      }
      anecdotes.splice(index, 1);
      saveAnecdotes(anecdotes);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Anecdote deleted' }));
      return;
    }
    
    if (pathname === '/api/graph' && method === 'GET') {
      const anecdotes = loadAnecdotes();
      const nodes = [];
      const links = [];
      const years = [...new Set(anecdotes.map(a => a.year))].sort((a, b) => a - b);
      years.forEach(year => nodes.push({ id: `year-${year}`, type: 'year', label: year.toString(), year }));
      const storytellers = [...new Set(anecdotes.map(a => a.storyteller))];
      storytellers.forEach(s => {
        const id = `storyteller-${s.replace(/\s+/g, '-')}`;
        nodes.push({ id, type: 'storyteller', label: s, storyteller: s });
        [...new Set(anecdotes.filter(a => a.storyteller === s).map(a => a.year))].forEach(year => {
          links.push({ source: id, target: `year-${year}`, type: 'storyteller-year' });
        });
      });
      anecdotes.forEach(story => {
        const id = `story-${story.id}`;
        nodes.push({ id, type: 'story', label: story.title, storyId: story.id, year: story.year, storyteller: story.storyteller, anecdote: story });
        links.push({ source: id, target: `year-${story.year}`, type: 'story-year' });
        links.push({ source: id, target: `storyteller-${story.storyteller.replace(/\s+/g, '-')}`, type: 'story-storyteller' });
        if (story.tags && story.tags.length > 0) {
          story.tags.forEach(tag => {
            const tagId = `tag-${tag}`;
            if (!nodes.find(n => n.id === tagId)) nodes.push({ id: tagId, type: 'tag', label: tag });
            links.push({ source: id, target: tagId, type: 'story-tag' });
          });
        }
      });
      res.writeHead(200);
      res.end(JSON.stringify({ nodes, links }));
      return;
    }
    
    if (pathname === '/api/verify-key' && method === 'POST') {
      const body = await parseBody();
      const { key } = body;
      if (!key) {
        res.writeHead(400);
        res.end(JSON.stringify({ valid: false, error: 'Key required' }));
        return;
      }
      if (key === ACCESS_KEY) {
        res.writeHead(200);
        res.end(JSON.stringify({ valid: true }));
        return;
      }
      res.writeHead(403);
      res.end(JSON.stringify({ valid: false, error: 'Invalid key' }));
      return;
    }
    
    // Subscriber endpoints
    if (pathname === '/api/subscribe' && method === 'POST') {
      const body = await parseBody();
      const { email, name } = body;
      
      if (!email || !email.includes('@')) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Valid email required' }));
        return;
      }
      
      const subscribers = loadSubscribers();
      const normalizedEmail = email.toLowerCase().trim();
      
      if (subscribers.find(s => s.email === normalizedEmail)) {
        res.writeHead(409);
        res.end(JSON.stringify({ error: 'Email already subscribed' }));
        return;
      }
      
      subscribers.push({
        id: generateId(),
        email: normalizedEmail,
        name: name || '',
        subscribedAt: Date.now()
      });
      
      if (saveSubscribers(subscribers)) {
        res.writeHead(201);
        res.end(JSON.stringify({ success: true, message: 'Subscribed successfully' }));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to subscribe' }));
      }
      return;
    }
    
    if (pathname === '/api/subscribers' && method === 'GET') {
      if (!verifyAccessKey()) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Access key required' }));
        return;
      }
      const subscribers = loadSubscribers().sort((a, b) => b.subscribedAt - a.subscribedAt);
      res.writeHead(200);
      res.end(JSON.stringify(subscribers));
      return;
    }
    
    if (pathname === '/api/subscribers/export' && method === 'GET') {
      if (!verifyAccessKey()) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Access key required' }));
        return;
      }
      const subscribers = loadSubscribers().sort((a, b) => b.subscribedAt - a.subscribedAt);
      const csv = ['Email,Name,Subscribed At', ...subscribers.map(s => `${s.email},"${s.name || ''}",${new Date(s.subscribedAt).toISOString()}`)].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
      res.writeHead(200);
      res.end(csv);
      return;
    }
    
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error('Error:', err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access key: ${ACCESS_KEY}`);
  console.log(`Data directory: ${dataDir}`);
});
