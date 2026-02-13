import { serve } from 'bun';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Database } from 'bun:sqlite';
import { createAnecdotesDb } from './db/anecdotes';
import { createProjectsDb } from './db/projects';
import { createStorylinesDb } from './db/storylines';
import { createSubscribersDb } from './db/subscribers';
import { generateProjectStoryboardWithLlm, generateStoryboardFrameWithLlm, generateStoryPackageWithLlm, polishNotesIntoBeatsWithLlm, refineSynopsisWithLlm, regenerateStoryboardSceneWithLlm } from './lib/storylineLlm';
import { handleAnecdotesRoutes } from './routes/anecdotes';
import { handleProjectsRoutes } from './routes/projects';
import { handleStorylinesRoutes } from './routes/storylines';
import { handleSubscribersRoutes } from './routes/subscribers';
import { handleUploadsRoutes } from './routes/uploads';

const PORT = parseInt(process.env.PORT || '3001');
const ACCESS_KEY = process.env.ACCESS_KEY || 'AFRO12';
const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-4.1-mini';

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

db.exec(`
  CREATE TABLE IF NOT EXISTS storyline_packages (
    id TEXT PRIMARY KEY,
    storylineId TEXT NOT NULL,
    payload TEXT NOT NULL,
    prompt TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    version INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    pseudoSynopsis TEXT NOT NULL,
    polishedSynopsis TEXT DEFAULT '',
    style TEXT DEFAULT 'cinematic',
    durationMinutes INTEGER DEFAULT 10,
    status TEXT DEFAULT 'draft',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS story_notes (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    source TEXT DEFAULT 'typed',
    rawText TEXT NOT NULL,
    transcript TEXT DEFAULT '',
    minuteMark REAL,
    orderIndex INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS story_beats (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    sourceNoteId TEXT,
    orderIndex INTEGER NOT NULL,
    minuteStart REAL NOT NULL,
    minuteEnd REAL NOT NULL,
    pseudoBeat TEXT NOT NULL,
    polishedBeat TEXT NOT NULL,
    objective TEXT DEFAULT '',
    conflict TEXT DEFAULT '',
    turnText TEXT DEFAULT '',
    intensity INTEGER DEFAULT 50,
    tags TEXT DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS project_packages (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    payload TEXT NOT NULL,
    prompt TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    version INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS project_style_bibles (
    projectId TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
  )
`);

const ensureTableColumn = (tableName: string, columnName: string, columnSql: string) => {
  const columns = db.query(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.find(column => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
  }
};

ensureTableColumn('story_beats', 'locked', 'INTEGER DEFAULT 0');

const generateId = (): string => crypto.randomUUID();

const verifyAccessKey = (req: Request): boolean => {
  const key = req.headers.get('x-access-key') || new URL(req.url).searchParams.get('key');
  return key === ACCESS_KEY;
};

const verifyAdminKey = (req: Request): boolean => {
  if (!ADMIN_ACCESS_KEY) return false;
  const key = req.headers.get('x-admin-key') || new URL(req.url).searchParams.get('adminKey');
  return key === ADMIN_ACCESS_KEY;
};

// Database helpers
const {
  getAllAnecdotes,
  getAnecdoteById,
  getAnecdotesByYear,
  createAnecdote,
  updateAnecdote,
  deleteAnecdote,
} = createAnecdotesDb({ db, uploadsDir, generateId });

const {
  loadStorylines,
  saveStorylines,
  listStorylinePackages,
  getLatestStorylinePackage,
  saveStorylinePackage,
} = createStorylinesDb({ db, generateId });

const {
  addSubscriber,
  listSubscribers,
  exportSubscribersCsv,
} = createSubscribersDb({ db, generateId });

const {
  listProjects,
  getProjectById,
  createProject,
  updateProjectSynopsis,
  addStoryNote,
  listStoryNotes,
  replaceProjectBeats,
  listStoryBeats,
  setBeatLocked,
  saveProjectPackage,
  getLatestProjectPackage,
  setStoryboardSceneLocked,
  getProjectStyleBible,
  updateProjectStyleBible,
} = createProjectsDb({ db, generateId });

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
  return generateStoryPackageWithLlm(buildStorylineContext(storyline), prompt);
};

const generateStoryboardScene = async (storyline: any, scene: any, prompt: string) => {
  const regenerated = await regenerateStoryboardSceneWithLlm(buildStorylineContext(storyline), scene, prompt);

  return {
    ...regenerated,
    sceneNumber: Number(regenerated?.sceneNumber || scene.sceneNumber),
    beatId: String(regenerated?.beatId || scene.beatId),
    slugline: String(regenerated?.slugline || scene.slugline || ''),
    visualDirection: String(regenerated?.visualDirection || scene.visualDirection || ''),
    camera: String(regenerated?.camera || scene.camera || ''),
    audio: String(regenerated?.audio || scene.audio || ''),
    voiceover: String(regenerated?.voiceover || scene.voiceover || ''),
    onScreenText: String(regenerated?.onScreenText || scene.onScreenText || ''),
    transition: String(regenerated?.transition || scene.transition || ''),
    durationSeconds: Number(regenerated?.durationSeconds || scene.durationSeconds || 6),
  };
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

const getDbStats = () => {
  const anecdotes = (db.query('SELECT COUNT(*) as count FROM anecdotes').get() as { count: number }).count;
  const media = (db.query('SELECT COUNT(*) as count FROM media').get() as { count: number }).count;
  const subscribers = (db.query('SELECT COUNT(*) as count FROM subscribers').get() as { count: number }).count;
  const projects = (db.query('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count;
  const storyNotes = (db.query('SELECT COUNT(*) as count FROM story_notes').get() as { count: number }).count;
  const storyBeats = (db.query('SELECT COUNT(*) as count FROM story_beats').get() as { count: number }).count;
  const projectPackages = (db.query('SELECT COUNT(*) as count FROM project_packages').get() as { count: number }).count;
  const storylinePackages = (db.query('SELECT COUNT(*) as count FROM storyline_packages').get() as { count: number }).count;
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
    projects,
    storyNotes,
    storyBeats,
    projectPackages,
    storylines,
    storylinePackages,
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

    const uploadsResponse = await handleUploadsRoutes({
      req,
      pathname,
      method,
      uploadsDir,
      corsHeaders,
      verifyAccessKey,
    });
    if (uploadsResponse) return uploadsResponse;

    if (pathname === '/api/health' && method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (pathname === '/api/admin/db-stats' && method === 'GET') {
      if (!verifyAdminKey(req)) return new Response(JSON.stringify({ error: 'Admin key required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(getDbStats()), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const projectsResponse = await handleProjectsRoutes({
      req,
      pathname,
      method,
      corsHeaders,
      verifyAccessKey,
      listProjects,
      getProjectById,
      createProject,
      updateProjectSynopsis,
      addStoryNote,
      listStoryNotes,
      replaceProjectBeats,
      listStoryBeats,
      setBeatLocked,
      saveProjectPackage,
      getLatestProjectPackage,
      setStoryboardSceneLocked,
      getProjectStyleBible,
      updateProjectStyleBible,
      refineSynopsisWithLlm,
      polishNotesIntoBeatsWithLlm,
      generateProjectStoryboardWithLlm,
      generateStoryboardFrameWithLlm,
      uploadsDir,
      generateId,
    });
    if (projectsResponse) return projectsResponse;

    const storylinesResponse = await handleStorylinesRoutes({
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
    });
    if (storylinesResponse) return storylinesResponse;

    const anecdotesResponse = await handleAnecdotesRoutes({
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
    });
    if (anecdotesResponse) return anecdotesResponse;

    if (pathname === '/api/verify-key' && method === 'POST') {
      const body = await req.json();
      const { key } = body;
      if (!key) return new Response(JSON.stringify({ valid: false, error: 'Key required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (key === ACCESS_KEY) return new Response(JSON.stringify({ valid: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ valid: false, error: 'Invalid key' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const subscribersResponse = await handleSubscribersRoutes({
      req,
      pathname,
      method,
      corsHeaders,
      verifyAccessKey,
      addSubscriber,
      listSubscribers,
      exportSubscribersCsv,
    });
    if (subscribersResponse) return subscribersResponse;

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  },
});

console.log(`Server running on port ${PORT}`);
console.log(`Access key: ${ACCESS_KEY}`);
console.log(`Admin key configured: ${ADMIN_ACCESS_KEY ? 'yes' : 'no'}`);
console.log(`LLM model: ${OPENAI_MODEL}`);
console.log(`Image model: ${OPENAI_IMAGE_MODEL}`);
console.log(`Database: ${DB_PATH}`);
