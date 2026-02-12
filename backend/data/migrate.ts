import { Database } from 'bun:sqlite';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

const dataDir = import.meta.dir;
const DB_PATH = join(dataDir, 'anecdotes.db');
const JSON_PATH = join(dataDir, 'anecdotes.json');
const SUBSCRIBERS_JSON_PATH = join(dataDir, 'subscribers.json');

// Initialize database
const db = new Database(DB_PATH);

// Create tables
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
  CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    subscribedAt INTEGER NOT NULL
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

db.exec(`
  CREATE TABLE IF NOT EXISTS storylines_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  )
`);

const anecdoteCount = db.query('SELECT COUNT(*) as count FROM anecdotes').get() as { count: number };
const subscriberCount = db.query('SELECT COUNT(*) as count FROM subscribers').get() as { count: number };

const insertAnecdote = db.query(`
  INSERT INTO anecdotes (id, date, year, title, story, storyteller, location, notes, tags, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMedia = db.query(`
  INSERT INTO media (id, anecdoteId, type, url, caption, createdAt)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertSubscriber = db.query(`
  INSERT INTO subscribers (id, email, name, subscribedAt)
  VALUES (?, ?, ?, ?)
`);

let migratedAnecdotes = 0;
let migratedSubscribers = 0;

if (anecdoteCount.count === 0 && existsSync(JSON_PATH)) {
  const jsonData = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  if (Array.isArray(jsonData) && jsonData.length > 0) {
    console.log(`Migrating ${jsonData.length} anecdotes from JSON to SQLite...`);

    for (const a of jsonData) {
      insertAnecdote.run(
        a.id,
        a.date,
        a.year,
        a.title,
        a.story,
        a.storyteller,
        a.location || '',
        a.notes || '',
        JSON.stringify(a.tags || []),
        a.createdAt || Date.now(),
        a.updatedAt || Date.now()
      );

      if (a.media && a.media.length > 0) {
        for (const m of a.media) {
          insertMedia.run(
            crypto.randomUUID(),
            a.id,
            m.type || 'image',
            m.url,
            m.caption || '',
            m.createdAt || Date.now()
          );
        }
      }
    }
    migratedAnecdotes = jsonData.length;
  } else {
    console.log('No anecdotes found in anecdotes.json.');
  }
} else if (anecdoteCount.count > 0) {
  console.log(`Anecdotes table already has ${anecdoteCount.count} row(s), skipping anecdote migration.`);
} else {
  console.log('No anecdotes.json found, skipping anecdote migration.');
}

if (subscriberCount.count === 0 && existsSync(SUBSCRIBERS_JSON_PATH)) {
  const subscribersJson = JSON.parse(readFileSync(SUBSCRIBERS_JSON_PATH, 'utf8'));
  if (Array.isArray(subscribersJson) && subscribersJson.length > 0) {
    console.log(`Migrating ${subscribersJson.length} subscribers from JSON to SQLite...`);
    for (const s of subscribersJson) {
      if (!s?.email) continue;
      insertSubscriber.run(
        s.id || crypto.randomUUID(),
        String(s.email).toLowerCase().trim(),
        s.name || '',
        typeof s.subscribedAt === 'number' ? s.subscribedAt : Date.now()
      );
    }
    migratedSubscribers = subscribersJson.length;
  } else {
    console.log('No subscribers found in subscribers.json.');
  }
} else if (subscriberCount.count > 0) {
  console.log(`Subscribers table already has ${subscriberCount.count} row(s), skipping subscriber migration.`);
} else {
  console.log('No subscribers.json found, skipping subscriber migration.');
}

console.log('Migration complete!');
console.log(`Database: ${DB_PATH}`);
console.log(`Migrated anecdotes: ${migratedAnecdotes}`);
console.log(`Migrated subscribers: ${migratedSubscribers}`);

// Verify
const newCount = db.query('SELECT COUNT(*) as count FROM anecdotes').get() as { count: number };
console.log(`Total anecdotes in database: ${newCount.count}`);
const newSubscriberCount = db.query('SELECT COUNT(*) as count FROM subscribers').get() as { count: number };
console.log(`Total subscribers in database: ${newSubscriberCount.count}`);
const storylineRow = db.query('SELECT payload FROM storylines_cache WHERE id = 1').get() as { payload?: string } | null;
const storylineTotal = storylineRow?.payload ? (JSON.parse(storylineRow.payload).length || 0) : 0;
console.log(`Total storylines in database: ${storylineTotal}`);
