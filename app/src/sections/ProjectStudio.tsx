import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Lock, Mic, Plus, ShieldAlert, Sparkles, Unlock, Wand2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import type { ContinuityIssue, MovieProject, ProjectBeat, ProjectStyleBible, StorylineGenerationResult, StorylinePackageRecord, StoryNote } from '@/types';

export function ProjectStudio() {
  const { isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<MovieProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [notes, setNotes] = useState<StoryNote[]>([]);
  const [beats, setBeats] = useState<ProjectBeat[]>([]);
  const [generatedPackage, setGeneratedPackage] = useState<StorylineGenerationResult | null>(null);
  const [latestPackage, setLatestPackage] = useState<StorylinePackageRecord | null>(null);
  const [styleBible, setStyleBible] = useState<ProjectStyleBible>({
    visualStyle: '',
    cameraGrammar: '',
    doList: [],
    dontList: [],
  });
  const [continuityIssues, setContinuityIssues] = useState<ContinuityIssue[]>([]);
  const [previewMode, setPreviewMode] = useState<'timeline' | 'intensity' | 'all' | null>(null);
  const [previewBeats, setPreviewBeats] = useState<ProjectBeat[]>([]);
  const [previewIssues, setPreviewIssues] = useState<ContinuityIssue[]>([]);

  const [newTitle, setNewTitle] = useState('Untitled Project');
  const [newPseudoSynopsis, setNewPseudoSynopsis] = useState('A struggling young artist gets one chance to stage a comeback performance while family pressure and self-doubt threaten to break his momentum.');
  const [noteInput, setNoteInput] = useState('');
  const [directorPrompt, setDirectorPrompt] = useState('Cinematic, emotionally grounded, practical for low-budget production.');
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isRecordingIdea, setIsRecordingIdea] = useState(false);
  const [isRecordCreating, setIsRecordCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getProjects();
        setProjects(data);
        if (!selectedProjectId && data.length) setSelectedProjectId(data[0].id);
      } catch {
        setProjects([]);
      }
    };
    load();
  }, []);

  const selectedProject = useMemo(() => {
    return projects.find(project => project.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject) return;
    const loadDetails = async () => {
      const [notesResponse, beatsResponse, storyboardResponse, styleBibleResponse, continuityResponse] = await Promise.all([
        api.getProjectNotes(selectedProject.id).catch(() => ({ items: [] })),
        api.getProjectBeats(selectedProject.id).catch(() => ({ items: [] })),
        api.getLatestProjectStoryboard(selectedProject.id).catch(() => ({ item: null })),
        api.getProjectStyleBible(selectedProject.id).catch(() => ({ item: { visualStyle: '', cameraGrammar: '', doList: [], dontList: [] } })),
        api.checkProjectContinuity(selectedProject.id).catch(() => ({ success: true, issues: [] })),
      ]);
      setNotes(notesResponse.items || []);
      setBeats(beatsResponse.items || []);
      setLatestPackage(storyboardResponse.item || null);
      setGeneratedPackage(storyboardResponse.item?.payload || null);
      setStyleBible(styleBibleResponse.item);
      setContinuityIssues(continuityResponse.issues || []);
    };
    loadDetails();
  }, [selectedProject?.id]);

  const saveStyleBible = async () => {
    if (!selectedProject || !isAuthenticated) return;
    setBusyMessage('Saving style bible...');
    try {
      const response = await api.updateProjectStyleBible(selectedProject.id, styleBible);
      setStyleBible(response.item);
      setBusyMessage('Style bible saved.');
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to save style bible');
    }
  };

  const createProjectFromInput = async (input: { pseudoSynopsis: string; title?: string }) => {
    if (!isAuthenticated || !input.pseudoSynopsis.trim()) return;
    setBusyMessage('Creating project...');
    try {
      const created = await api.createProject({
        title: (input.title || '').trim() || undefined,
        pseudoSynopsis: input.pseudoSynopsis.trim(),
        style: 'cinematic',
        durationMinutes: 10,
      });
      setProjects(prev => [created, ...prev]);
      setSelectedProjectId(created.id);
      setBusyMessage('Project created.');
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to create project');
    }
  };

  const createProject = async () => {
    await createProjectFromInput({
      title: newTitle,
      pseudoSynopsis: newPseudoSynopsis,
    });
  };

  const recordProjectIdea = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBusyMessage('Speech recognition is not supported in this browser.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = '';
    recognition.onstart = () => {
      setIsRecordingIdea(true);
      setBusyMessage('Listening... dump your idea naturally.');
    };
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      if (interim) setBusyMessage(`Listening... ${interim}`);
    };
    recognition.onerror = () => {
      setBusyMessage('Could not capture project idea audio. Try again.');
      setIsRecordingIdea(false);
    };
    recognition.onend = () => {
      setIsRecordingIdea(false);
      const text = finalText.trim();
      if (!text) return;
      setNewPseudoSynopsis(prev => `${prev ? `${prev}\n\n` : ''}${text}`.trim());
      if (!newTitle.trim()) {
        const draftTitle = text.split(/\s+/).slice(0, 6).join(' ').replace(/[.,!?;:]+$/g, '');
        setNewTitle(draftTitle);
      }
      setBusyMessage('Audio idea captured. Tap New Project to continue.');
    };

    recognition.start();
  };

  const recordAndCreateProject = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBusyMessage('Speech recognition is not supported in this browser.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = '';
    recognition.onstart = () => {
      setIsRecordCreating(true);
      setBusyMessage('Listening... your project will be created automatically.');
    };
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      if (interim) setBusyMessage(`Listening... ${interim}`);
    };
    recognition.onerror = () => {
      setBusyMessage('Could not capture audio idea. Try again.');
      setIsRecordCreating(false);
    };
    recognition.onend = async () => {
      setIsRecordCreating(false);
      const transcript = finalText.trim();
      if (!transcript) {
        setBusyMessage('No audio captured. Try again.');
        return;
      }

      const generatedTitle = transcript
        .split(/\s+/)
        .slice(0, 6)
        .join(' ')
        .replace(/[.,!?;:]+$/g, '');

      await createProjectFromInput({
        title: newTitle.trim() || generatedTitle,
        pseudoSynopsis: transcript,
      });
    };

    recognition.start();
  };

  const refineSynopsis = async () => {
    if (!selectedProject || !isAuthenticated) return;
    setBusyMessage('Refining synopsis...');
    try {
      const response = await api.refineProjectSynopsis(selectedProject.id);
      setProjects(prev => prev.map(project => project.id === selectedProject.id ? response.project : project));
      setBusyMessage('Synopsis polished.');
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to refine synopsis');
    }
  };

  const addNote = async () => {
    if (!selectedProject || !isAuthenticated || !noteInput.trim()) return;
    setBusyMessage('Adding note...');
    try {
      const response = await api.addProjectNote(selectedProject.id, { rawText: noteInput.trim(), source: 'typed' });
      setNotes(prev => [...prev, response.item]);
      setNoteInput('');
      setBusyMessage('Note added.');
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to add note');
    }
  };

  const recordNote = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBusyMessage('Speech recognition is not supported in this browser.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = '';
    recognition.onstart = () => {
      setIsListening(true);
      setBusyMessage('Listening... speak your pseudo-beat.');
    };
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim) setBusyMessage(`Listening... ${interim}`);
    };
    recognition.onerror = () => {
      setBusyMessage('Could not capture audio note. Try again.');
      setIsListening(false);
    };
    recognition.onend = async () => {
      setIsListening(false);
      const text = finalText.trim();
      if (!text || !selectedProject || !isAuthenticated) return;
      try {
        const response = await api.addProjectNote(selectedProject.id, { rawText: text, transcript: text, source: 'audio' });
        setNotes(prev => [...prev, response.item]);
        setBusyMessage('Audio note added.');
      } catch (error) {
        setBusyMessage(error instanceof Error ? error.message : 'Failed to save audio note');
      }
    };

    recognition.start();
  };

  const polishBeats = async () => {
    if (!selectedProject || !isAuthenticated) return;
    setBusyMessage('Polishing beats from notes...');
    try {
      const response = await api.polishProjectBeats(selectedProject.id);
      setBeats(response.items || []);
      setBusyMessage(`Generated ${response.items.length} polished beats.`);
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to polish beats');
    }
  };

  const toggleBeatLock = async (beat: ProjectBeat) => {
    if (!selectedProject || !isAuthenticated) return;
    try {
      const nextLocked = !beat.locked;
      const response = await api.setProjectBeatLock(selectedProject.id, beat.id, nextLocked);
      setBeats(prev => prev.map(item => item.id === beat.id ? { ...item, locked: response.item.locked } : item));
      setBusyMessage(nextLocked ? 'Beat locked.' : 'Beat unlocked.');
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to update beat lock');
    }
  };

  const toggleSceneLock = async (beatId: string, locked: boolean) => {
    if (!selectedProject || !isAuthenticated) return;
    try {
      const response = await api.setProjectStoryboardSceneLock(selectedProject.id, beatId, !locked);
      setLatestPackage(response.item);
      setGeneratedPackage(response.item.payload);
      setBusyMessage(!locked ? 'Scene locked.' : 'Scene unlocked.');
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to update scene lock');
    }
  };

  const runContinuityCheck = async () => {
    if (!selectedProject) return;
    setBusyMessage('Running continuity check...');
    try {
      const response = await api.checkProjectContinuity(selectedProject.id);
      setContinuityIssues(response.issues || []);
      setBusyMessage(`Continuity check complete: ${response.issues.length} issue(s).`);
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed continuity check');
    }
  };

  const previewContinuityFix = async (mode: 'timeline' | 'intensity' | 'all') => {
    if (!selectedProject || !isAuthenticated) return;
    setBusyMessage(`Previewing ${mode} continuity fix...`);
    try {
      const response = await api.fixProjectContinuity(selectedProject.id, mode, true);
      setPreviewMode(mode);
      setPreviewBeats(response.items || []);
      setPreviewIssues(response.issues || []);
      setBusyMessage(`Preview ready (${mode}).`);
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to preview continuity fix');
    }
  };

  const applyPreviewFix = async () => {
    if (!selectedProject || !previewMode || !isAuthenticated) return;
    setBusyMessage(`Applying ${previewMode} continuity fix...`);
    try {
      const response = await api.fixProjectContinuity(selectedProject.id, previewMode, false);
      setBeats(response.items || []);
      setContinuityIssues(response.issues || []);
      setPreviewMode(null);
      setPreviewBeats([]);
      setPreviewIssues([]);
      setBusyMessage(`Auto-fix (${response.mode}) applied. ${response.issues.length} issue(s) remain.`);
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed continuity auto-fix');
    }
  };

  const previewChanges = useMemo(() => {
    if (!previewMode || !previewBeats.length) return [];
    const currentByOrder = new Map<number, ProjectBeat>();
    beats.forEach(beat => currentByOrder.set(Number(beat.orderIndex), beat));

    return previewBeats
      .map(candidate => {
        const current = currentByOrder.get(Number(candidate.orderIndex));
        if (!current) return null;
        const fieldsChanged: string[] = [];
        if (Number(current.minuteStart) !== Number(candidate.minuteStart)) fieldsChanged.push(`start ${current.minuteStart} -> ${candidate.minuteStart}`);
        if (Number(current.minuteEnd) !== Number(candidate.minuteEnd)) fieldsChanged.push(`end ${current.minuteEnd} -> ${candidate.minuteEnd}`);
        if (Number(current.intensity) !== Number(candidate.intensity)) fieldsChanged.push(`intensity ${current.intensity} -> ${candidate.intensity}`);
        if (!fieldsChanged.length) return null;
        return {
          orderIndex: candidate.orderIndex,
          beatId: candidate.id,
          locked: !!current.locked,
          fieldsChanged,
          text: candidate.polishedBeat,
        };
      })
      .filter(Boolean) as Array<{ orderIndex: number; beatId: string; locked: boolean; fieldsChanged: string[]; text: string }>;
  }, [beats, previewBeats, previewMode]);

  const getSceneFrameUrl = (scene: any) => {
    if (scene.imageUrl && typeof scene.imageUrl === 'string' && scene.imageUrl.startsWith('/uploads/')) {
      return api.getUploadsUrl(scene.imageUrl);
    }

    const basePrompt = scene.imagePrompt || `${scene.slugline}. ${scene.visualDirection}`;
    const fullPrompt = `${basePrompt}. cinematic storyboard frame, concept art, dramatic lighting, 16:9`;
    const seedSource = `${selectedProject?.id || 'project'}-${scene.sceneNumber}-${scene.beatId}`;
    const seed = Array.from(seedSource).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=1024&height=576&seed=${seed}&nologo=true`;
  };

  const generateStoryboard = async () => {
    if (!selectedProject || !isAuthenticated) return;
    setBusyMessage('Generating storyboard package...');
    try {
      const response = await api.generateProjectStoryboard(selectedProject.id, directorPrompt);
      setGeneratedPackage(response.result);
      setLatestPackage(response.package);
      setBusyMessage(`Storyboard generated (v${response.package.version}).`);
    } catch (error) {
      setBusyMessage(error instanceof Error ? error.message : 'Failed to generate storyboard');
    }
  };

  return (
    <section id="project-studio" className="relative min-h-screen py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl md:text-5xl text-white mb-3">DIRECTOR STUDIO</h2>
          <p className="text-gray-400">From rough idea to minute-by-minute cinematic blueprint.</p>
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <aside className="rounded-2xl border border-gray-800 bg-black/35 p-4 h-fit">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Projects</p>
            <div className="space-y-2 mb-4">
              {projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${selectedProjectId === project.id ? 'border-[#D0FF59] text-[#D0FF59] bg-[#D0FF59]/10' : 'border-gray-800 text-gray-300'}`}
                >
                  <p className="font-medium truncate">{project.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{project.durationMinutes} min · {project.style}</p>
                </button>
              ))}
            </div>

            {isAuthenticated && (
              <div className="space-y-2 border-t border-gray-800 pt-4">
                <input value={newTitle} onChange={event => setNewTitle(event.target.value)} className="w-full bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm" placeholder="Project title (optional)" />
                <textarea value={newPseudoSynopsis} onChange={event => setNewPseudoSynopsis(event.target.value)} className="w-full bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm min-h-24" placeholder="Dump your rough movie idea here (typed or audio)" />
                <button onClick={recordProjectIdea} disabled={!isAuthenticated || isRecordingIdea} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded border border-gray-700 text-sm text-gray-200 disabled:opacity-50">
                  <Mic className="w-4 h-4" /> {isRecordingIdea ? 'Listening...' : 'Record Idea'}
                </button>
                <button onClick={recordAndCreateProject} disabled={!isAuthenticated || isRecordCreating} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-white text-black text-sm font-semibold disabled:opacity-50">
                  <Mic className="w-4 h-4" /> {isRecordCreating ? 'Listening...' : 'Record & Create'}
                </button>
                <button onClick={createProject} disabled={!newPseudoSynopsis.trim() || !isAuthenticated} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-[#D0FF59] text-black text-sm font-semibold disabled:opacity-50">
                  <Plus className="w-4 h-4" /> New Project
                </button>
              </div>
            )}
          </aside>

          <div className="space-y-6">
            {!selectedProject && <div className="rounded-2xl border border-gray-800 bg-black/30 p-6 text-gray-400">Create your first project to start.</div>}

            {selectedProject && (
              <>
                <div className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-2xl text-white font-semibold">{selectedProject.title}</h3>
                    <span className="text-xs uppercase tracking-widest text-gray-500">10-min cinematic</span>
                  </div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Pseudo Synopsis</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line">{selectedProject.pseudoSynopsis}</p>
                  <p className="text-xs uppercase tracking-widest text-gray-500 mt-4 mb-1">Polished Synopsis</p>
                  <p className="text-sm text-gray-200 whitespace-pre-line">{selectedProject.polishedSynopsis || 'Not polished yet.'}</p>
                  <button onClick={refineSynopsis} disabled={!isAuthenticated} className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded border border-gray-700 text-sm text-gray-200 hover:text-[#D0FF59] disabled:opacity-50">
                    <Wand2 className="w-4 h-4" /> Polish Synopsis
                  </button>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Style Bible</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    <textarea
                      value={styleBible.visualStyle}
                      onChange={event => setStyleBible(prev => ({ ...prev, visualStyle: event.target.value }))}
                      className="bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm min-h-20"
                      placeholder="Visual style"
                    />
                    <textarea
                      value={styleBible.cameraGrammar}
                      onChange={event => setStyleBible(prev => ({ ...prev, cameraGrammar: event.target.value }))}
                      className="bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm min-h-20"
                      placeholder="Camera grammar"
                    />
                    <textarea
                      value={(styleBible.doList || []).join('\n')}
                      onChange={event => setStyleBible(prev => ({ ...prev, doList: event.target.value.split('\n').map(item => item.trim()).filter(Boolean) }))}
                      className="bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm min-h-20"
                      placeholder="Do list (one per line)"
                    />
                    <textarea
                      value={(styleBible.dontList || []).join('\n')}
                      onChange={event => setStyleBible(prev => ({ ...prev, dontList: event.target.value.split('\n').map(item => item.trim()).filter(Boolean) }))}
                      className="bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm min-h-20"
                      placeholder="Don't list (one per line)"
                    />
                  </div>
                  <button onClick={saveStyleBible} disabled={!isAuthenticated} className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded border border-gray-700 text-sm text-gray-200 hover:text-[#D0FF59] disabled:opacity-50">
                    <Sparkles className="w-4 h-4" /> Save Style Bible
                  </button>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Pseudo-Beat Capture</p>
                  <div className="flex gap-2">
                    <textarea value={noteInput} onChange={event => setNoteInput(event.target.value)} className="flex-1 bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm min-h-16" placeholder="Type a rough beat note..." />
                    <button onClick={addNote} disabled={!isAuthenticated} className="h-fit inline-flex items-center gap-2 px-3 py-2 rounded bg-[#D0FF59] text-black text-sm font-semibold disabled:opacity-50">
                      <Plus className="w-4 h-4" /> Add
                    </button>
                    <button onClick={recordNote} disabled={!isAuthenticated || isListening} className="h-fit inline-flex items-center gap-2 px-3 py-2 rounded border border-gray-700 text-sm text-gray-300 disabled:opacity-50">
                      <Mic className="w-4 h-4" /> {isListening ? 'Listening...' : 'Record'}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {notes.map(note => (
                      <div key={note.id} className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2 text-sm text-gray-300">
                        {note.rawText}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-xs uppercase tracking-widest text-gray-500">Minute-by-Minute Timeline</p>
                    <button onClick={polishBeats} disabled={!isAuthenticated} className="inline-flex items-center gap-2 px-3 py-2 rounded border border-gray-700 text-sm text-gray-200 hover:text-[#D0FF59] disabled:opacity-50">
                      <Sparkles className="w-4 h-4" /> Polish Beats
                    </button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-2">
                    {beats.map(beat => (
                      <div key={beat.id} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-[#D0FF59]">{beat.minuteStart}m - {beat.minuteEnd}m</p>
                          <button onClick={() => toggleBeatLock(beat)} disabled={!isAuthenticated} className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-300 disabled:opacity-50">
                            {beat.locked ? <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" />Locked</span> : <span className="inline-flex items-center gap-1"><Unlock className="w-3 h-3" />Unlocked</span>}
                          </button>
                        </div>
                        <p className="text-sm text-gray-200 mt-1">{beat.polishedBeat}</p>
                        <p className="text-xs text-gray-500 mt-2">Objective: {beat.objective || 'n/a'}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg border border-gray-800 bg-black/25 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs uppercase tracking-widest text-gray-500">Continuity Checker</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={runContinuityCheck} className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-700 rounded text-gray-300">
                          <ShieldAlert className="w-3 h-3" /> Run Check
                        </button>
                        <button onClick={() => previewContinuityFix('timeline')} disabled={!isAuthenticated} className="text-xs px-2 py-1 border border-gray-700 rounded text-gray-300 disabled:opacity-50">
                          Preview Timeline
                        </button>
                        <button onClick={() => previewContinuityFix('intensity')} disabled={!isAuthenticated} className="text-xs px-2 py-1 border border-gray-700 rounded text-gray-300 disabled:opacity-50">
                          Preview Intensity
                        </button>
                        <button onClick={() => previewContinuityFix('all')} disabled={!isAuthenticated} className="text-xs px-2 py-1 border border-gray-700 rounded text-[#D0FF59] disabled:opacity-50">
                          Preview All
                        </button>
                      </div>
                    </div>
                    {continuityIssues.length === 0 ? (
                      <p className="text-xs text-gray-500">No continuity issues detected.</p>
                    ) : (
                      <div className="space-y-2">
                        {continuityIssues.slice(0, 8).map((issue, index) => (
                          <div key={`${issue.code}-${issue.beatId || index}`} className="rounded border border-gray-800 px-2 py-1">
                            <p className="text-xs text-gray-300">{issue.message}</p>
                            {issue.suggestion && <p className="text-[11px] text-gray-500 mt-1">{issue.suggestion}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-black/35 p-5">
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Director Prompt</p>
                  <textarea value={directorPrompt} onChange={event => setDirectorPrompt(event.target.value)} className="w-full bg-black/40 border border-gray-800 rounded px-3 py-2 text-sm min-h-16" />
                  <button onClick={generateStoryboard} disabled={!isAuthenticated} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded bg-[#D0FF59] text-black text-sm font-semibold disabled:opacity-50">
                    <Clapperboard className="w-4 h-4" /> Generate Storyboard
                  </button>
                </div>

                {generatedPackage && (
                  <div className="rounded-2xl border border-gray-800 bg-black/40 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="text-xs uppercase tracking-widest text-gray-500">Story Package Workspace</p>
                      {latestPackage && <p className="text-xs text-gray-500">v{latestPackage.version}</p>}
                    </div>
                    <h4 className="text-xl text-white font-semibold">{generatedPackage.writeup.headline}</h4>
                    <p className="text-sm text-gray-400 mt-1">{generatedPackage.writeup.deck}</p>
                    <div className="mt-4 grid md:grid-cols-2 gap-3">
                      {generatedPackage.storyboard.map(scene => (
                        <div key={`${scene.sceneNumber}-${scene.beatId}`} className="rounded-lg border border-gray-800 bg-black/30 p-3 space-y-2">
                          <div className="rounded-md overflow-hidden border border-gray-800 bg-black/40 aspect-video">
                            <img
                              src={getSceneFrameUrl(scene)}
                              alt={`Scene ${scene.sceneNumber} concept frame`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-gray-100">Scene {scene.sceneNumber} · Beat {scene.beatId}</p>
                            <button onClick={() => toggleSceneLock(scene.beatId, !!scene.locked)} disabled={!isAuthenticated} className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-300 disabled:opacity-50">
                              {scene.locked ? <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" />Locked</span> : <span className="inline-flex items-center gap-1"><Unlock className="w-3 h-3" />Unlocked</span>}
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{scene.slugline}</p>
                          <p className="text-[11px] text-gray-500 line-clamp-2">{scene.imagePrompt || scene.visualDirection}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {busyMessage && <p className="text-sm text-gray-400 mt-6 text-center">{busyMessage}</p>}
      </div>

      {previewMode && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-800 bg-[#050505] p-5 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-lg text-white font-semibold">Continuity Fix Preview ({previewMode})</h4>
              <button onClick={() => { setPreviewMode(null); setPreviewBeats([]); setPreviewIssues([]); }} className="p-1 rounded border border-gray-700 text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Proposed Beat Changes</p>
            {previewChanges.length === 0 ? (
              <p className="text-sm text-gray-400">No beat field changes are needed.</p>
            ) : (
              <div className="space-y-2">
                {previewChanges.map(change => (
                  <div key={`${change.orderIndex}-${change.beatId}`} className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                    <p className="text-xs text-[#D0FF59]">Beat #{change.orderIndex} {change.locked ? '(locked)' : ''}</p>
                    <p className="text-xs text-gray-300 mt-1">{change.fieldsChanged.join(' · ')}</p>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs uppercase tracking-widest text-gray-500 mt-4 mb-2">Remaining Issues After Fix</p>
            {previewIssues.length === 0 ? (
              <p className="text-sm text-gray-400">No issues remain.</p>
            ) : (
              <div className="space-y-2">
                {previewIssues.slice(0, 8).map((issue, index) => (
                  <div key={`${issue.code}-${issue.beatId || index}`} className="rounded border border-gray-800 px-2 py-1">
                    <p className="text-xs text-gray-300">{issue.message}</p>
                    {issue.suggestion && <p className="text-[11px] text-gray-500 mt-1">{issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => { setPreviewMode(null); setPreviewBeats([]); setPreviewIssues([]); }} className="px-3 py-2 rounded border border-gray-700 text-sm text-gray-300">
                Cancel
              </button>
              <button onClick={() => applyPreviewFix()} disabled={!isAuthenticated} className="px-4 py-2 rounded bg-[#D0FF59] text-black text-sm font-semibold disabled:opacity-50">
                Apply Fix
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
