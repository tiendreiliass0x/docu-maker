import type { Database } from 'bun:sqlite';

type CreateProjectsDbArgs = {
  db: Database;
  generateId: () => string;
};

export const createProjectsDb = ({ db, generateId }: CreateProjectsDbArgs) => {
  const DEFAULT_STYLE_BIBLE = {
    visualStyle: 'Grounded cinematic realism with expressive close-ups and motivated camera movement.',
    cameraGrammar: 'Use intentional composition, practical coverage, and transitions that preserve orientation.',
    doList: ['Keep emotional clarity', 'Show cause-and-effect', 'Use specific sensory detail'],
    dontList: ['Avoid generic inspirational cliches', 'Avoid timeline jumps without transition cards'],
  };

  const listProjects = () => {
    return db.query(`
      SELECT id, title, pseudoSynopsis, polishedSynopsis, style, durationMinutes, status, createdAt, updatedAt
      FROM projects
      ORDER BY updatedAt DESC
    `).all() as any[];
  };

  const getProjectById = (id: string) => {
    return db.query(`
      SELECT id, title, pseudoSynopsis, polishedSynopsis, style, durationMinutes, status, createdAt, updatedAt
      FROM projects
      WHERE id = ?
    `).get(id) as any;
  };

  const createProject = (input: { title?: string; pseudoSynopsis: string; style?: string; durationMinutes?: number }) => {
    const now = Date.now();
    const id = generateId();
    const style = (input.style || 'cinematic').toLowerCase();
    const durationMinutes = Number(input.durationMinutes || 10);
    const synopsis = String(input.pseudoSynopsis || '').trim();
    const explicitTitle = String(input.title || '').trim();
    const fallbackTitle = synopsis
      ? synopsis.split(/\s+/).slice(0, 6).join(' ').replace(/[.,!?;:]+$/g, '')
      : `Untitled Project ${new Date(now).toLocaleDateString()}`;
    const title = explicitTitle || fallbackTitle;

    db.query(`
      INSERT INTO projects (id, title, pseudoSynopsis, polishedSynopsis, style, durationMinutes, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, synopsis, '', style, durationMinutes, 'draft', now, now);
    db.query(`
      INSERT INTO project_style_bibles (projectId, payload, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
    `).run(id, JSON.stringify(DEFAULT_STYLE_BIBLE), now, now);
    return getProjectById(id);
  };

  const getProjectStyleBible = (projectId: string) => {
    const row = db.query('SELECT payload FROM project_style_bibles WHERE projectId = ?').get(projectId) as { payload?: string } | null;
    if (!row?.payload) return DEFAULT_STYLE_BIBLE;
    try {
      return JSON.parse(row.payload);
    } catch {
      return DEFAULT_STYLE_BIBLE;
    }
  };

  const updateProjectStyleBible = (projectId: string, payload: any) => {
    const now = Date.now();
    const serialized = JSON.stringify(payload || DEFAULT_STYLE_BIBLE);
    db.query(`
      INSERT INTO project_style_bibles (projectId, payload, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(projectId) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt
    `).run(projectId, serialized, now, now);
    return getProjectStyleBible(projectId);
  };

  const updateProjectSynopsis = (id: string, polishedSynopsis: string) => {
    const now = Date.now();
    db.query('UPDATE projects SET polishedSynopsis = ?, updatedAt = ? WHERE id = ?').run(polishedSynopsis, now, id);
    return getProjectById(id);
  };

  const addStoryNote = (projectId: string, input: { rawText: string; minuteMark?: number; source?: string; transcript?: string }) => {
    const now = Date.now();
    const id = generateId();
    const row = db.query('SELECT COALESCE(MAX(orderIndex), 0) as maxOrder FROM story_notes WHERE projectId = ?').get(projectId) as { maxOrder: number };
    const orderIndex = Number(row?.maxOrder || 0) + 1;
    db.query(`
      INSERT INTO story_notes (id, projectId, source, rawText, transcript, minuteMark, orderIndex, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      input.source || 'typed',
      input.rawText,
      input.transcript || '',
      typeof input.minuteMark === 'number' ? input.minuteMark : null,
      orderIndex,
      now,
      now
    );
    return db.query('SELECT * FROM story_notes WHERE id = ?').get(id) as any;
  };

  const listStoryNotes = (projectId: string) => {
    return db.query('SELECT * FROM story_notes WHERE projectId = ? ORDER BY orderIndex ASC, createdAt ASC').all(projectId) as any[];
  };

  const replaceProjectBeats = (projectId: string, beats: any[]) => {
    const now = Date.now();
    const existingRows = db.query('SELECT * FROM story_beats WHERE projectId = ? ORDER BY orderIndex ASC').all(projectId) as any[];
    const lockByOrder = new Map<number, any>();
    existingRows.forEach(row => {
      if (Number(row.locked || 0) === 1) lockByOrder.set(Number(row.orderIndex), row);
    });

    db.query('DELETE FROM story_beats WHERE projectId = ?').run(projectId);
    beats.forEach((beat, index) => {
      const orderIndex = index + 1;
      const lockedExisting = lockByOrder.get(orderIndex);
      if (lockedExisting) {
        db.query(`
          INSERT INTO story_beats (
            id, projectId, sourceNoteId, orderIndex, minuteStart, minuteEnd,
            pseudoBeat, polishedBeat, objective, conflict, turnText, intensity, tags, locked, createdAt, updatedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generateId(),
          projectId,
          lockedExisting.sourceNoteId || null,
          orderIndex,
          Number(lockedExisting.minuteStart || 0),
          Number(lockedExisting.minuteEnd || 1),
          String(lockedExisting.pseudoBeat || ''),
          String(lockedExisting.polishedBeat || ''),
          String(lockedExisting.objective || ''),
          String(lockedExisting.conflict || ''),
          String(lockedExisting.turnText || ''),
          Number(lockedExisting.intensity || 50),
          String(lockedExisting.tags || '[]'),
          1,
          now,
          now
        );
        return;
      }

      db.query(`
        INSERT INTO story_beats (
          id, projectId, sourceNoteId, orderIndex, minuteStart, minuteEnd,
          pseudoBeat, polishedBeat, objective, conflict, turnText, intensity, tags, locked, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        generateId(),
        projectId,
        beat.sourceNoteId || null,
        orderIndex,
        Number(beat.minuteStart || 0),
        Number(beat.minuteEnd || 1),
        String(beat.pseudoBeat || ''),
        String(beat.polishedBeat || ''),
        String(beat.objective || ''),
        String(beat.conflict || ''),
        String(beat.turn || beat.turnText || ''),
        Number(beat.intensity || 50),
        JSON.stringify(Array.isArray(beat.tags) ? beat.tags : []),
        Number(beat.locked ? 1 : 0),
        now,
        now
      );
    });
    return listStoryBeats(projectId);
  };

  const setBeatLocked = (projectId: string, beatId: string, locked: boolean) => {
    const now = Date.now();
    db.query('UPDATE story_beats SET locked = ?, updatedAt = ? WHERE id = ? AND projectId = ?').run(locked ? 1 : 0, now, beatId, projectId);
    const row = db.query('SELECT * FROM story_beats WHERE id = ? AND projectId = ?').get(beatId, projectId) as any;
    if (!row) return null;
    return {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      turn: row.turnText,
      locked: Number(row.locked || 0) === 1,
    };
  };

  const listStoryBeats = (projectId: string) => {
    const rows = db.query('SELECT * FROM story_beats WHERE projectId = ? ORDER BY orderIndex ASC').all(projectId) as any[];
    return rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      turn: row.turnText,
      locked: Number(row.locked || 0) === 1,
    }));
  };

  const saveProjectPackage = (projectId: string, payload: any, prompt: string) => {
    const now = Date.now();
    const id = generateId();
    const row = db.query('SELECT COALESCE(MAX(version), 0) as maxVersion FROM project_packages WHERE projectId = ?').get(projectId) as { maxVersion: number };
    const version = Number(row?.maxVersion || 0) + 1;
    db.query(`
      INSERT INTO project_packages (id, projectId, payload, prompt, status, version, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, JSON.stringify(payload), prompt || '', 'draft', version, now, now);
    return { id, projectId, payload, prompt: prompt || '', status: 'draft', version, createdAt: now, updatedAt: now };
  };

  const getLatestProjectPackage = (projectId: string) => {
    const row = db.query(`
      SELECT id, projectId, payload, prompt, status, version, createdAt, updatedAt
      FROM project_packages
      WHERE projectId = ?
      ORDER BY version DESC
      LIMIT 1
    `).get(projectId) as any;
    if (!row) return null;
    return { ...row, payload: JSON.parse(row.payload) };
  };

  const setStoryboardSceneLocked = (projectId: string, beatId: string, locked: boolean) => {
    const latest = getLatestProjectPackage(projectId);
    if (!latest?.payload?.storyboard || !Array.isArray(latest.payload.storyboard)) return null;
    const now = Date.now();
    const updatedPayload = {
      ...latest.payload,
      storyboard: latest.payload.storyboard.map((scene: any) => (
        String(scene.beatId) === String(beatId)
          ? { ...scene, locked }
          : scene
      )),
    };
    db.query('UPDATE project_packages SET payload = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(updatedPayload), now, latest.id);
    return { ...latest, payload: updatedPayload, updatedAt: now };
  };

  return {
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
  };
};
