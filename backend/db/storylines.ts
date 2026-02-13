import type { Database } from 'bun:sqlite';

type CreateStorylinesDbArgs = {
  db: Database;
  generateId: () => string;
};

export const createStorylinesDb = ({ db, generateId }: CreateStorylinesDbArgs) => {
  const loadStorylines = () => {
    const row = db.query('SELECT payload FROM storylines_cache WHERE id = 1').get() as { payload?: string } | null;
    if (!row?.payload) return [];
    try {
      return JSON.parse(row.payload);
    } catch {
      return [];
    }
  };

  const saveStorylines = (data: any) => {
    try {
      db.query(`
        INSERT INTO storylines_cache (id, payload, updatedAt)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt
      `).run(JSON.stringify(data), Date.now());
      return true;
    } catch {
      return false;
    }
  };

  const listStorylinePackages = (storylineId: string) => {
    const rows = db.query(`
      SELECT id, storylineId, payload, prompt, status, version, createdAt, updatedAt
      FROM storyline_packages
      WHERE storylineId = ?
      ORDER BY version DESC
    `).all(storylineId) as any[];

    return rows.map(row => ({
      id: row.id,
      storylineId: row.storylineId,
      prompt: row.prompt || '',
      status: row.status || 'draft',
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      payload: JSON.parse(row.payload),
    }));
  };

  const getLatestStorylinePackage = (storylineId: string) => {
    const row = db.query(`
      SELECT id, storylineId, payload, prompt, status, version, createdAt, updatedAt
      FROM storyline_packages
      WHERE storylineId = ?
      ORDER BY version DESC
      LIMIT 1
    `).get(storylineId) as any;

    if (!row) return null;
    return {
      id: row.id,
      storylineId: row.storylineId,
      prompt: row.prompt || '',
      status: row.status || 'draft',
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      payload: JSON.parse(row.payload),
    };
  };

  const saveStorylinePackage = (storylineId: string, payload: any, prompt: string, status: string = 'draft') => {
    const now = Date.now();
    const latest = db.query('SELECT version FROM storyline_packages WHERE storylineId = ? ORDER BY version DESC LIMIT 1').get(storylineId) as { version?: number } | null;
    const version = (latest?.version || 0) + 1;
    const id = generateId();

    db.query(`
      INSERT INTO storyline_packages (id, storylineId, payload, prompt, status, version, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, storylineId, JSON.stringify(payload), prompt || '', status || 'draft', version, now, now);

    return { id, storylineId, payload, prompt: prompt || '', status: status || 'draft', version, createdAt: now, updatedAt: now };
  };

  return {
    loadStorylines,
    saveStorylines,
    listStorylinePackages,
    getLatestStorylinePackage,
    saveStorylinePackage,
  };
};
