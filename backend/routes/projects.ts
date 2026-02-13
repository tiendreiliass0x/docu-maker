import { join } from 'path';

type ProjectsRouteArgs = {
  req: Request;
  pathname: string;
  method: string;
  corsHeaders: Record<string, string>;
  verifyAccessKey: (req: Request) => boolean;
  listProjects: () => any[];
  getProjectById: (id: string) => any;
  createProject: (input: { title?: string; pseudoSynopsis: string; style?: string; durationMinutes?: number }) => any;
  updateProjectSynopsis: (id: string, polishedSynopsis: string) => any;
  addStoryNote: (projectId: string, input: { rawText: string; minuteMark?: number; source?: string; transcript?: string }) => any;
  listStoryNotes: (projectId: string) => any[];
  replaceProjectBeats: (projectId: string, beats: any[]) => any[];
  listStoryBeats: (projectId: string) => any[];
  setBeatLocked: (projectId: string, beatId: string, locked: boolean) => any;
  saveProjectPackage: (projectId: string, payload: any, prompt: string) => any;
  getLatestProjectPackage: (projectId: string) => any;
  setStoryboardSceneLocked: (projectId: string, beatId: string, locked: boolean) => any;
  getProjectStyleBible: (projectId: string) => any;
  updateProjectStyleBible: (projectId: string, payload: any) => any;
  refineSynopsisWithLlm: (args: { pseudoSynopsis: string; style?: string; durationMinutes?: number; styleBible?: any }) => Promise<any>;
  polishNotesIntoBeatsWithLlm: (args: { synopsis: string; notes: any[]; durationMinutes?: number; style?: string; styleBible?: any }) => Promise<any>;
  generateProjectStoryboardWithLlm: (args: { title: string; synopsis: string; beats: any[]; prompt?: string; style?: string; styleBible?: any }) => Promise<any>;
  generateStoryboardFrameWithLlm: (prompt: string) => Promise<string>;
  uploadsDir: string;
  generateId: () => string;
};

const jsonHeaders = (corsHeaders: Record<string, string>) => ({ ...corsHeaders, 'Content-Type': 'application/json' });

export const handleProjectsRoutes = async (args: ProjectsRouteArgs): Promise<Response | null> => {
  const {
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
  } = args;

  const buildContinuityIssues = (beats: any[]) => {
    const issues: any[] = [];
    if (!beats.length) return issues;

    const normalized = [...beats].sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0));
    if (Number(normalized[0].minuteStart || 0) > 0.5) {
      issues.push({
        code: 'LATE_START',
        severity: 'warning',
        message: 'Timeline starts late. Consider opening at minute 0.',
        suggestion: 'Set first beat minuteStart to 0.',
      });
    }

    for (let index = 0; index < normalized.length; index++) {
      const beat = normalized[index];
      if (!String(beat.objective || '').trim()) {
        issues.push({ code: 'MISSING_OBJECTIVE', severity: 'warning', beatId: beat.id, message: 'Beat objective is empty.', suggestion: 'Add a clear objective for this beat.' });
      }
      if (!String(beat.conflict || '').trim()) {
        issues.push({ code: 'MISSING_CONFLICT', severity: 'warning', beatId: beat.id, message: 'Beat conflict is empty.', suggestion: 'Add a concrete obstacle or tension.' });
      }

      if (index > 0) {
        const previous = normalized[index - 1];
        const previousEnd = Number(previous.minuteEnd || 0);
        const currentStart = Number(beat.minuteStart || 0);
        if (currentStart > previousEnd + 0.6) {
          issues.push({ code: 'TIMELINE_GAP', severity: 'warning', beatId: beat.id, message: 'Gap detected between consecutive beats.', suggestion: 'Fill the gap or merge adjacent beats.' });
        }
        if (currentStart < previousEnd - 0.2) {
          issues.push({ code: 'TIMELINE_OVERLAP', severity: 'error', beatId: beat.id, message: 'Beat timing overlaps previous beat.', suggestion: 'Adjust minuteStart/minuteEnd sequencing.' });
        }

        const jump = Math.abs(Number(beat.intensity || 50) - Number(previous.intensity || 50));
        if (jump >= 45) {
          issues.push({ code: 'INTENSITY_JUMP', severity: 'warning', beatId: beat.id, message: 'Large intensity jump may feel abrupt.', suggestion: 'Add transition beat or smooth intensity progression.' });
        }
      }
    }

    const seen = new Set<string>();
    normalized.forEach(beat => {
      const key = String(beat.polishedBeat || '').trim().toLowerCase().slice(0, 90);
      if (!key) return;
      if (seen.has(key)) {
        issues.push({ code: 'DUPLICATE_BEAT', severity: 'warning', beatId: beat.id, message: 'Potential duplicate beat text.', suggestion: 'Differentiate actions or emotional turns.' });
      } else {
        seen.add(key);
      }
    });

    return issues;
  };

  const autoFixContinuity = (beats: any[], mode: 'timeline' | 'intensity' | 'all') => {
    const normalized = [...beats].sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0));
    if (!normalized.length) return normalized;

    const shouldFixTimeline = mode === 'timeline' || mode === 'all';
    const shouldFixIntensity = mode === 'intensity' || mode === 'all';

    const fixed = normalized.map(beat => ({ ...beat }));

    if (shouldFixTimeline) {
      for (let index = 0; index < fixed.length; index++) {
        const beat = fixed[index];
        if (beat.locked) continue;

        if (index === 0) {
          beat.minuteStart = 0;
          if (Number(beat.minuteEnd || 0) <= Number(beat.minuteStart || 0)) {
            beat.minuteEnd = Number(beat.minuteStart || 0) + 0.8;
          }
          continue;
        }

        const previous = fixed[index - 1];
        const previousEnd = Number(previous.minuteEnd || 0);
        beat.minuteStart = previousEnd;
        if (Number(beat.minuteEnd || 0) <= Number(beat.minuteStart || 0)) {
          beat.minuteEnd = Number(beat.minuteStart || 0) + 0.8;
        }
      }
    }

    if (shouldFixIntensity) {
      for (let index = 1; index < fixed.length; index++) {
        const beat = fixed[index];
        if (beat.locked) continue;

        const previous = fixed[index - 1];
        const previousIntensity = Number(previous.intensity || 50);
        const current = Number(beat.intensity || 50);
        const delta = current - previousIntensity;
        const maxJump = 25;

        if (Math.abs(delta) > maxJump) {
          beat.intensity = Math.max(0, Math.min(100, previousIntensity + (delta > 0 ? maxJump : -maxJump)));
        }
      }
    }

    return fixed;
  };

  if (pathname === '/api/projects' && method === 'GET') {
    return new Response(JSON.stringify(listProjects()), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname === '/api/projects' && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const body = await req.json();
    if (!body?.pseudoSynopsis || !String(body.pseudoSynopsis).trim()) {
      return new Response(JSON.stringify({ error: 'pseudoSynopsis is required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }
    const project = createProject({
      title: body.title ? String(body.title) : '',
      pseudoSynopsis: String(body.pseudoSynopsis),
      style: body.style || 'cinematic',
      durationMinutes: Number(body.durationMinutes || 10),
    });
    return new Response(JSON.stringify(project), { status: 201, headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+$/) && method === 'GET') {
    const projectId = pathname.split('/')[3];
    const item = getProjectById(projectId);
    if (!item) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
    return new Response(JSON.stringify(item), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/style-bible$/) && method === 'GET') {
    const projectId = pathname.split('/')[3];
    return new Response(JSON.stringify({ item: getProjectStyleBible(projectId) }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/style-bible$/) && method === 'PUT') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const body = await req.json();
    const item = updateProjectStyleBible(projectId, body?.payload || body || {});
    return new Response(JSON.stringify({ success: true, item }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/synopsis\/refine$/) && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const project = getProjectById(projectId);
    if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });

    try {
      const refined = await refineSynopsisWithLlm({
        pseudoSynopsis: project.pseudoSynopsis,
        style: project.style || 'cinematic',
        durationMinutes: project.durationMinutes || 10,
        styleBible: getProjectStyleBible(projectId),
      });
      const synopsis = String(refined?.synopsis || '').trim();
      const updated = updateProjectSynopsis(projectId, synopsis);
      return new Response(JSON.stringify({ success: true, refined, project: updated }), { headers: jsonHeaders(corsHeaders) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refine synopsis';
      return new Response(JSON.stringify({ error: message }), { status: 502, headers: jsonHeaders(corsHeaders) });
    }
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/notes$/) && method === 'GET') {
    const projectId = pathname.split('/')[3];
    return new Response(JSON.stringify({ items: listStoryNotes(projectId) }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/notes$/) && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const body = await req.json();
    if (!body?.rawText && !body?.transcript) {
      return new Response(JSON.stringify({ error: 'rawText or transcript is required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }
    const item = addStoryNote(projectId, {
      rawText: String(body.rawText || body.transcript || ''),
      transcript: String(body.transcript || ''),
      source: String(body.source || 'typed'),
      minuteMark: typeof body.minuteMark === 'number' ? body.minuteMark : undefined,
    });
    return new Response(JSON.stringify({ success: true, item }), { status: 201, headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/beats$/) && method === 'GET') {
    const projectId = pathname.split('/')[3];
    return new Response(JSON.stringify({ items: listStoryBeats(projectId) }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/beats\/[^/]+\/lock$/) && method === 'PATCH') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const beatId = pathname.split('/')[5];
    const body = await req.json().catch(() => ({}));
    const locked = Boolean(body?.locked);
    const item = setBeatLocked(projectId, beatId, locked);
    return new Response(JSON.stringify({ success: true, item }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/beats\/polish$/) && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const project = getProjectById(projectId);
    if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
    const notes = listStoryNotes(projectId);
    if (!notes.length) {
      return new Response(JSON.stringify({ error: 'Add notes first' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    }

    try {
      const polished = await polishNotesIntoBeatsWithLlm({
        synopsis: project.polishedSynopsis || project.pseudoSynopsis,
        notes: notes.map((note, index) => ({
          sourceNoteId: note.id,
          order: index + 1,
          text: note.transcript || note.rawText,
          minuteMark: note.minuteMark,
        })),
        durationMinutes: project.durationMinutes || 10,
        style: project.style || 'cinematic',
        styleBible: getProjectStyleBible(projectId),
      });
      const beats = replaceProjectBeats(projectId, polished?.beats || []);
      return new Response(JSON.stringify({ success: true, items: beats }), { headers: jsonHeaders(corsHeaders) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to polish beats';
      return new Response(JSON.stringify({ error: message }), { status: 502, headers: jsonHeaders(corsHeaders) });
    }
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/storyboard\/generate$/) && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const project = getProjectById(projectId);
    if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
    const beats = listStoryBeats(projectId);
    if (!beats.length) return new Response(JSON.stringify({ error: 'No polished beats found' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    const body = await req.json().catch(() => ({}));

    try {
      const result = await generateProjectStoryboardWithLlm({
        title: project.title,
        synopsis: project.polishedSynopsis || project.pseudoSynopsis,
        beats,
        prompt: typeof body?.prompt === 'string' ? body.prompt : '',
        style: project.style || 'cinematic',
        styleBible: getProjectStyleBible(projectId),
      });

      if (Array.isArray(result?.storyboard)) {
        for (const scene of result.storyboard) {
          try {
            const prompt = scene.imagePrompt || `${scene.slugline}. ${scene.visualDirection}`;
            const imageBase64 = await generateStoryboardFrameWithLlm(prompt);
            const filename = `${Date.now()}-${generateId()}.png`;
            const filePath = join(uploadsDir, filename);
            await Bun.write(filePath, Buffer.from(imageBase64, 'base64'));
            scene.imageUrl = `/uploads/${filename}`;
          } catch {
            scene.imageUrl = '';
          }
        }
      }

      const saved = saveProjectPackage(projectId, result, typeof body?.prompt === 'string' ? body.prompt : '');
      return new Response(JSON.stringify({ success: true, result, package: saved }), { headers: jsonHeaders(corsHeaders) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate storyboard';
      return new Response(JSON.stringify({ error: message }), { status: 502, headers: jsonHeaders(corsHeaders) });
    }
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/storyboard$/) && method === 'GET') {
    const projectId = pathname.split('/')[3];
    const item = getLatestProjectPackage(projectId);
    return new Response(JSON.stringify({ item }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/storyboard\/scene-lock$/) && method === 'PATCH') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const body = await req.json().catch(() => ({}));
    if (!body?.beatId) return new Response(JSON.stringify({ error: 'beatId is required' }), { status: 400, headers: jsonHeaders(corsHeaders) });
    const item = setStoryboardSceneLocked(projectId, String(body.beatId), Boolean(body.locked));
    if (!item) return new Response(JSON.stringify({ error: 'No storyboard package found' }), { status: 404, headers: jsonHeaders(corsHeaders) });
    return new Response(JSON.stringify({ success: true, item }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/continuity\/check$/) && method === 'GET') {
    const projectId = pathname.split('/')[3];
    const beats = listStoryBeats(projectId);
    const issues = buildContinuityIssues(beats);
    return new Response(JSON.stringify({ success: true, issues }), { headers: jsonHeaders(corsHeaders) });
  }

  if (pathname.match(/^\/api\/projects\/[^/]+\/continuity\/fix$/) && method === 'POST') {
    if (!verifyAccessKey(req)) return new Response(JSON.stringify({ error: 'Access key required' }), { status: 401, headers: jsonHeaders(corsHeaders) });
    const projectId = pathname.split('/')[3];
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === 'timeline' || body?.mode === 'intensity' || body?.mode === 'all' ? body.mode : 'all';
    const dryRun = Boolean(body?.dryRun);

    const beats = listStoryBeats(projectId);
    if (!beats.length) return new Response(JSON.stringify({ error: 'No beats to fix' }), { status: 400, headers: jsonHeaders(corsHeaders) });

    const fixed = autoFixContinuity(beats, mode);
    if (dryRun) {
      const issues = buildContinuityIssues(fixed);
      return new Response(JSON.stringify({ success: true, items: fixed, issues, mode, dryRun: true }), { headers: jsonHeaders(corsHeaders) });
    }

    const items = replaceProjectBeats(projectId, fixed);
    const issues = buildContinuityIssues(items);
    return new Response(JSON.stringify({ success: true, items, issues, mode }), { headers: jsonHeaders(corsHeaders) });
  }

  return null;
};
