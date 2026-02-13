import { basename, join } from 'path';
import { existsSync } from 'fs';
import type { Database } from 'bun:sqlite';

type CreateAnecdotesDbArgs = {
  db: Database;
  uploadsDir: string;
  generateId: () => string;
};

export const createAnecdotesDb = ({ db, uploadsDir, generateId }: CreateAnecdotesDbArgs) => {
  const getAllAnecdotes = () => {
    const anecdotes = db.query('SELECT * FROM anecdotes ORDER BY year DESC, date DESC').all() as any[];
    return anecdotes.map(a => ({
      ...a,
      tags: JSON.parse(a.tags || '[]'),
      media: db.query('SELECT * FROM media WHERE anecdoteId = ?').all(a.id) as any[],
    }));
  };

  const getAnecdoteById = (id: string) => {
    const a = db.query('SELECT * FROM anecdotes WHERE id = ?').get(id) as any;
    if (!a) return null;
    return {
      ...a,
      tags: JSON.parse(a.tags || '[]'),
      media: db.query('SELECT * FROM media WHERE anecdoteId = ?').all(id) as any[],
    };
  };

  const getAnecdotesByYear = (year: number) => {
    const anecdotes = db.query('SELECT * FROM anecdotes WHERE year = ? ORDER BY date DESC').all(year) as any[];
    return anecdotes.map(a => ({
      ...a,
      tags: JSON.parse(a.tags || '[]'),
      media: db.query('SELECT * FROM media WHERE anecdoteId = ?').all(a.id) as any[],
    }));
  };

  const createAnecdote = (data: any) => {
    const id = generateId();
    const now = Date.now();
    db.query(`
      INSERT INTO anecdotes (id, date, year, title, story, storyteller, location, notes, tags, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.date, data.year, data.title, data.story, data.storyteller, data.location || '', data.notes || '', JSON.stringify(data.tags || []), now, now);

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

  return {
    getAllAnecdotes,
    getAnecdoteById,
    getAnecdotesByYear,
    createAnecdote,
    updateAnecdote,
    deleteAnecdote,
  };
};
