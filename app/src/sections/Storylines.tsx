import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Clapperboard, Sparkles, Film, ArrowRight, Tag, User, MapPin, Clock, Flame, Bug, Lock, Unlock, RefreshCcw } from 'lucide-react';
import { useTimeline } from '@/context/TimelineContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { generateStorylines } from '@/lib/storylineGenerator';
import type { Storyline, StorylineBeat, StoryboardScene, StorylineGenerationResult, StorylinePackageRecord, StorylineStyle } from '@/types';

const STYLE_META: Record<StorylineStyle, { label: string; badge: string; glow: string; icon: ReactElement }> = {
  nightlife: {
    label: 'Nightlife Cut',
    badge: 'bg-amber-300 text-black',
    glow: 'from-amber-400/25 via-transparent to-transparent',
    icon: <Sparkles className="w-4 h-4" />,
  },
  chronicle: {
    label: 'Chronicle Cut',
    badge: 'bg-sky-300 text-black',
    glow: 'from-sky-400/25 via-transparent to-transparent',
    icon: <Film className="w-4 h-4" />,
  },
  cinematic: {
    label: 'Cinematic Cut',
    badge: 'bg-rose-300 text-black',
    glow: 'from-rose-400/30 via-transparent to-transparent',
    icon: <Flame className="w-4 h-4" />,
  },
  breakthrough: {
    label: 'Breakthrough Cut',
    badge: 'bg-[#D0FF59] text-black',
    glow: 'from-[#D0FF59]/30 via-transparent to-transparent',
    icon: <Clapperboard className="w-4 h-4" />,
  },
};

export function Storylines() {
  const { anecdotes, setExpandedAnecdote } = useTimeline();
  const { isAuthenticated } = useAuth();
  const generatedStorylines = useMemo(() => generateStorylines(anecdotes), [anecdotes]);
  const [storylines, setStorylines] = useState<Storyline[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [directorPrompt, setDirectorPrompt] = useState('Write in a cinematic documentary voice with clear scene transitions and emotionally grounded narration.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [generatedByStoryline, setGeneratedByStoryline] = useState<Record<string, StorylineGenerationResult>>({});
  const [packageHistoryByStoryline, setPackageHistoryByStoryline] = useState<Record<string, StorylinePackageRecord[]>>({});
  const [activePackageTab, setActivePackageTab] = useState<'writeup' | 'storyboard' | 'extras'>('writeup');
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [regeneratingSceneBeatId, setRegeneratingSceneBeatId] = useState<string | null>(null);
  const lastSavedSignature = useRef<string | null>(null);
  const canViewStorylineInsights = isAuthenticated;
  const showDebug = canViewStorylineInsights && (import.meta.env.DEV || import.meta.env.VITE_STORYLINE_DEBUG === 'true');

  useEffect(() => {
    let isMounted = true;
    const loadCache = async () => {
      try {
        const cached = await api.getStorylines();
        if (isMounted && cached.length) {
          setStorylines(cached);
        }
      } catch (error) {
        console.warn('Failed to load storyline cache:', error);
      }
    };
    loadCache();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!generatedStorylines.length) return;
    setStorylines(generatedStorylines);
  }, [generatedStorylines]);

  useEffect(() => {
    if (!storylines.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !storylines.find(line => line.id === selectedId)) {
      setSelectedId(storylines[0].id);
    }
  }, [storylines, selectedId]);

  const selected = storylines.find(line => line.id === selectedId) || storylines[0];
  const generatedPackage = selected ? generatedByStoryline[selected.id] : null;
  const packageHistory = selected ? (packageHistoryByStoryline[selected.id] || []) : [];
  const orderedStorylines = useMemo(() => {
    if (!storylines.length || !selectedId) return storylines;
    const selectedLine = storylines.find(line => line.id === selectedId);
    if (!selectedLine) return storylines;
    return [selectedLine, ...storylines.filter(line => line.id !== selectedId)];
  }, [storylines, selectedId]);

  useEffect(() => {
    if (!isAuthenticated || !generatedStorylines.length) return;
    const signature = generatedStorylines
      .map(line => [
        line.id,
        line.title,
        line.openingLine,
        line.closingLine,
        line.beats
          .map(beat => [
            beat.id,
            beat.anecdote.id,
            beat.summary,
            beat.voiceover,
            beat.intensity,
            beat.connection?.type || '',
            beat.connection?.label || '',
          ].join('~'))
          .join(','),
      ].join(':'))
      .join('|');
    if (signature === lastSavedSignature.current) return;
    lastSavedSignature.current = signature;

    api.saveStorylines(generatedStorylines).catch((error) => {
      console.warn('Failed to auto-save storylines:', error);
    });
  }, [generatedStorylines, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !selected) return;
    let isMounted = true;

    const loadPackages = async () => {
      try {
        const [latest, history] = await Promise.all([
          api.getLatestStorylinePackage(selected.id),
          api.getStorylinePackages(selected.id),
        ]);

        if (!isMounted) return;
        if (latest.item?.payload) {
          setGeneratedByStoryline(prev => ({ ...prev, [selected.id]: latest.item!.payload }));
        }
        setPackageHistoryByStoryline(prev => ({ ...prev, [selected.id]: history.items || [] }));
      } catch {
        if (!isMounted) return;
        setPackageHistoryByStoryline(prev => ({ ...prev, [selected.id]: prev[selected.id] || [] }));
      }
    };

    loadPackages();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, selected?.id]);

  const handleSave = async () => {
    if (!storylines.length) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const result = await api.saveStorylines(storylines);
      setSaveMessage(`Saved ${result.count} storyline${result.count === 1 ? '' : 's'} to SQLite`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save storylines');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePackage = async () => {
    if (!selected) return;
    setIsGenerating(true);
    setGenerationMessage(null);

    try {
      const response = await api.generateStoryPackage(selected, directorPrompt);
      setGeneratedByStoryline(prev => ({ ...prev, [selected.id]: response.result }));
      setPackageHistoryByStoryline(prev => ({
        ...prev,
        [selected.id]: [response.package, ...(prev[selected.id] || [])],
      }));
      setGenerationMessage(`Generated and saved as version v${response.package.version}.`);
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : 'Failed to generate story package');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveCurrentPackage = async () => {
    if (!selected || !generatedPackage) return;
    setIsSavingPackage(true);
    setGenerationMessage(null);

    try {
      const response = await api.saveStorylinePackage(selected.id, generatedPackage, directorPrompt, 'draft');
      setPackageHistoryByStoryline(prev => ({
        ...prev,
        [selected.id]: [response.item, ...(prev[selected.id] || [])],
      }));
      setGenerationMessage(`Saved current package as version v${response.item.version}.`);
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : 'Failed to save package');
    } finally {
      setIsSavingPackage(false);
    }
  };

  const updateGeneratedPackage = (updater: (current: StorylineGenerationResult) => StorylineGenerationResult) => {
    if (!selected || !generatedPackage) return;
    setGeneratedByStoryline(prev => ({
      ...prev,
      [selected.id]: updater(prev[selected.id]),
    }));
  };

  const addSceneDiff = (scene: StoryboardScene, fieldsChanged: string[], reason: 'manual-edit' | 'scene-regenerate') => {
    if (!fieldsChanged.length) return;
    updateGeneratedPackage(current => ({
      ...current,
      meta: {
        ...(current.meta || {}),
        sceneDiffs: [
          ...(current.meta?.sceneDiffs || []),
          {
            sceneNumber: scene.sceneNumber,
            beatId: scene.beatId,
            fieldsChanged,
            reason,
            changedAt: Date.now(),
          },
        ],
      },
    }));
  };

  const updateSceneField = (beatId: string, field: keyof StoryboardScene, value: string | number | boolean) => {
    if (!generatedPackage) return;
    const previous = generatedPackage.storyboard.find(scene => scene.beatId === beatId);
    if (!previous) return;
    if (previous[field] === value) return;

    updateGeneratedPackage(current => ({
      ...current,
      storyboard: current.storyboard.map(scene => scene.beatId === beatId ? { ...scene, [field]: value } : scene),
    }));
    addSceneDiff(previous, [String(field)], 'manual-edit');
  };

  const toggleSceneLock = (beatId: string) => {
    if (!generatedPackage) return;
    updateGeneratedPackage(current => ({
      ...current,
      storyboard: current.storyboard.map(scene => scene.beatId === beatId ? { ...scene, locked: !scene.locked } : scene),
    }));
  };

  const handleRegenerateScene = async (scene: StoryboardScene) => {
    if (!selected || !generatedPackage || scene.locked) return;
    setRegeneratingSceneBeatId(scene.beatId);
    setGenerationMessage(null);

    try {
      const response = await api.regenerateStorylineScene(selected, scene, directorPrompt);
      const regenerated = {
        ...response.scene,
        beatId: scene.beatId,
        sceneNumber: scene.sceneNumber,
        locked: scene.locked,
        editorNotes: scene.editorNotes || '',
        shotPlan: scene.shotPlan || [],
      };

      const fieldsChanged = (['slugline', 'visualDirection', 'camera', 'audio', 'voiceover', 'onScreenText', 'transition', 'durationSeconds'] as const)
        .filter(field => regenerated[field] !== scene[field]);

      const nextPayload: StorylineGenerationResult = {
        ...generatedPackage,
        storyboard: generatedPackage.storyboard.map(item => item.beatId === scene.beatId ? regenerated : item),
        meta: {
          ...(generatedPackage.meta || {}),
          sceneDiffs: [
            ...(generatedPackage.meta?.sceneDiffs || []),
            {
              sceneNumber: scene.sceneNumber,
              beatId: scene.beatId,
              fieldsChanged: [...fieldsChanged],
              reason: 'scene-regenerate',
              changedAt: Date.now(),
            },
          ],
        },
      };

      setGeneratedByStoryline(prev => ({ ...prev, [selected.id]: nextPayload }));
      const saved = await api.saveStorylinePackage(selected.id, nextPayload, directorPrompt, 'draft');
      setPackageHistoryByStoryline(prev => ({
        ...prev,
        [selected.id]: [saved.item, ...(prev[selected.id] || [])],
      }));
      setGenerationMessage(`Scene ${scene.sceneNumber} regenerated and saved as v${saved.item.version}.`);
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : 'Failed to regenerate scene');
    } finally {
      setRegeneratingSceneBeatId(null);
    }
  };

  return (
    <section id="storylines" className="relative min-h-screen py-24 px-4">
      <div className="text-center mb-12">
        <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-white mb-4">
          THE STORYLINES
        </h2>
        <p className="text-gray-400 text-lg max-w-3xl mx-auto">
          We stitch the anecdotes into multiple narrative arcs. Pick a cut, explore the chain, and dive into each moment.
        </p>
      </div>

      {!storylines.length ? (
        <div className="max-w-3xl mx-auto glass rounded-2xl p-10 text-center">
          <Clapperboard className="w-14 h-14 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Add more anecdotes to generate storylines.</p>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[360px_1fr] gap-8">
          <div className="space-y-4">
            {orderedStorylines.map((line, index) => {
              const isSelected = selected?.id === line.id;
              const staggerOffset = isSelected ? 0 : Math.min(22, (index + 1) * 6);
              return (
                <button
                key={line.id}
                onClick={() => setSelectedId(line.id)}
                style={{ transform: `translateX(${staggerOffset}px)`, zIndex: orderedStorylines.length - index }}
                className={`relative w-full text-left p-5 rounded-2xl border transition-all duration-300 group overflow-hidden ${
                  isSelected
                    ? 'border-[#D0FF59]/70 bg-gray-900 shadow-[0_0_30px_rgba(208,255,89,0.15)]'
                    : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:translate-x-1'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-r ${STYLE_META[line.style].glow}`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full ${STYLE_META[line.style].badge}`}>
                      {STYLE_META[line.style].icon}
                      {STYLE_META[line.style].label}
                    </span>
                    <span className="text-xs text-gray-400">{line.beats.length} beats</span>
                  </div>
                  <h3 className="text-white text-lg font-semibold mb-2 group-hover:text-[#D0FF59] transition-colors">
                    {line.title}
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {line.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-4">
                    <span>{line.timeframe.years[0]}-{line.timeframe.years[line.timeframe.years.length - 1]}</span>
                    <span>{line.tags.length} themes</span>
                  </div>
                </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="glass rounded-3xl p-6 md:p-8 relative overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${STYLE_META[selected.style].glow}`} />
              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                      <Clock className="w-4 h-4" />
                      <span>{new Date(selected.timeframe.start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                      <ArrowRight className="w-4 h-4" />
                      <span>{new Date(selected.timeframe.end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-semibold text-white mb-2">{selected.title}</h3>
                    <p className="text-gray-400 max-w-2xl">{selected.tone}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full ${STYLE_META[selected.style].badge}`}>
                      {STYLE_META[selected.style].icon}
                      {STYLE_META[selected.style].label}
                    </span>
                    {isAuthenticated && (
                      <>
                        <button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-200 hover:border-[#D0FF59] hover:text-[#D0FF59] transition-colors disabled:opacity-60"
                        >
                          {isSaving ? 'Saving...' : 'Save storylines'}
                        </button>
                        <button
                          onClick={handleGeneratePackage}
                          disabled={isGenerating}
                          className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-200 hover:border-sky-300 hover:text-sky-300 transition-colors disabled:opacity-60"
                        >
                          {isGenerating ? 'Generating...' : 'Generate write-up'}
                        </button>
                        <button
                          onClick={handleSaveCurrentPackage}
                          disabled={isSavingPackage || !generatedPackage}
                          className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-200 hover:border-emerald-300 hover:text-emerald-300 transition-colors disabled:opacity-60"
                        >
                          {isSavingPackage ? 'Saving package...' : 'Save current package'}
                        </button>
                      </>
                    )}
                    {saveMessage && (
                      <span className="text-[11px] text-gray-500">{saveMessage}</span>
                    )}
                    {generationMessage && (
                      <span className="text-[11px] text-gray-500 max-w-[220px] text-right">{generationMessage}</span>
                    )}
                  </div>
                </div>

                {isAuthenticated && (
                  <div className="mt-5 bg-black/35 border border-gray-800 rounded-2xl p-4">
                    <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">Director Prompt</p>
                    <textarea
                      value={directorPrompt}
                      onChange={(event) => setDirectorPrompt(event.target.value)}
                      className="w-full min-h-20 bg-black/40 border border-gray-700 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-300"
                      placeholder="Add guidance for narrative style, audience, pacing, and storyboard detail."
                    />
                  </div>
                )}

                {generatedPackage && (
                  <div className="mt-6 border border-gray-800 bg-black/40 rounded-2xl p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <p className="text-xs uppercase tracking-widest text-gray-500">Story Package Workspace</p>
                      {packageHistory.length > 0 && (
                        <p className="text-[11px] text-gray-500">
                          Latest version: v{packageHistory[0].version} ({new Date(packageHistory[0].updatedAt).toLocaleString()})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {(['writeup', 'storyboard', 'extras'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setActivePackageTab(tab)}
                          className={`px-3 py-1.5 rounded-full border text-xs uppercase tracking-wide transition-colors ${
                            activePackageTab === tab
                              ? 'border-[#D0FF59] text-[#D0FF59] bg-[#D0FF59]/10'
                              : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {activePackageTab === 'writeup' && (
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Generated Write-Up</p>
                        <h4 className="text-xl text-white font-semibold">{generatedPackage.writeup.headline}</h4>
                        <p className="text-gray-400 text-sm mt-1">{generatedPackage.writeup.deck}</p>
                        <p className="text-gray-300 text-sm leading-relaxed mt-3 whitespace-pre-line">{generatedPackage.writeup.narrative}</p>
                      </div>
                    )}

                    {activePackageTab === 'storyboard' && (
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Generated Storyboard</p>
                        <div className="space-y-2">
                          {generatedPackage.storyboard.map(scene => (
                            <div key={`${selected?.id}-${scene.sceneNumber}-${scene.beatId}`} className="rounded-xl border border-gray-800 bg-black/35 p-3">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-sm text-gray-100 font-medium">Scene {scene.sceneNumber} - Beat {scene.beatId}</p>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleSceneLock(scene.beatId)}
                                    className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                                  >
                                    {scene.locked ? <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" />Locked</span> : <span className="inline-flex items-center gap-1"><Unlock className="w-3 h-3" />Unlocked</span>}
                                  </button>
                                  <button
                                    onClick={() => handleRegenerateScene(scene)}
                                    disabled={!!scene.locked || regeneratingSceneBeatId === scene.beatId}
                                    className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-sky-300 disabled:opacity-50"
                                  >
                                    <span className="inline-flex items-center gap-1"><RefreshCcw className="w-3 h-3" />{regeneratingSceneBeatId === scene.beatId ? 'Regenerating...' : 'Regenerate scene'}</span>
                                  </button>
                                </div>
                              </div>

                              <div className="grid md:grid-cols-2 gap-2">
                                <input
                                  value={scene.slugline}
                                  onChange={(event) => updateSceneField(scene.beatId, 'slugline', event.target.value)}
                                  disabled={!!scene.locked}
                                  className="bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-60"
                                  placeholder="Slugline"
                                />
                                <input
                                  value={scene.durationSeconds}
                                  onChange={(event) => updateSceneField(scene.beatId, 'durationSeconds', Number(event.target.value) || 0)}
                                  disabled={!!scene.locked}
                                  className="bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-60"
                                  placeholder="Duration seconds"
                                  type="number"
                                  min={1}
                                />
                                <input
                                  value={scene.camera}
                                  onChange={(event) => updateSceneField(scene.beatId, 'camera', event.target.value)}
                                  disabled={!!scene.locked}
                                  className="bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-60"
                                  placeholder="Camera"
                                />
                                <input
                                  value={scene.transition}
                                  onChange={(event) => updateSceneField(scene.beatId, 'transition', event.target.value)}
                                  disabled={!!scene.locked}
                                  className="bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-60"
                                  placeholder="Transition"
                                />
                              </div>

                              <textarea
                                value={scene.visualDirection}
                                onChange={(event) => updateSceneField(scene.beatId, 'visualDirection', event.target.value)}
                                disabled={!!scene.locked}
                                className="w-full mt-2 bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 min-h-16 disabled:opacity-60"
                                placeholder="Visual direction"
                              />
                              <textarea
                                value={scene.audio}
                                onChange={(event) => updateSceneField(scene.beatId, 'audio', event.target.value)}
                                disabled={!!scene.locked}
                                className="w-full mt-2 bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 min-h-12 disabled:opacity-60"
                                placeholder="Audio"
                              />
                              <textarea
                                value={scene.voiceover}
                                onChange={(event) => updateSceneField(scene.beatId, 'voiceover', event.target.value)}
                                disabled={!!scene.locked}
                                className="w-full mt-2 bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 min-h-14 disabled:opacity-60"
                                placeholder="Voiceover"
                              />
                              <textarea
                                value={scene.onScreenText}
                                onChange={(event) => updateSceneField(scene.beatId, 'onScreenText', event.target.value)}
                                disabled={!!scene.locked}
                                className="w-full mt-2 bg-black/40 border border-gray-800 rounded px-2 py-1 text-xs text-gray-200 min-h-12 disabled:opacity-60"
                                placeholder="On-screen text"
                              />
                              <textarea
                                value={scene.editorNotes || ''}
                                onChange={(event) => updateSceneField(scene.beatId, 'editorNotes', event.target.value)}
                                className="w-full mt-2 bg-black/30 border border-gray-800 rounded px-2 py-1 text-xs text-gray-400 min-h-12"
                                placeholder="Editor notes (not rendered)"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activePackageTab === 'extras' && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-gray-800 bg-black/35 p-3">
                          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Logline</p>
                          <p className="text-sm text-gray-200">{generatedPackage.extras.logline}</p>
                        </div>
                        <div className="rounded-xl border border-gray-800 bg-black/35 p-3">
                          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Social Caption</p>
                          <p className="text-sm text-gray-200">{generatedPackage.extras.socialCaption}</p>
                        </div>
                        <div className="rounded-xl border border-gray-800 bg-black/35 p-3">
                          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Pull Quotes</p>
                          <ul className="space-y-1 text-sm text-gray-200">
                            {generatedPackage.extras.pullQuotes.map((quote, index) => (
                              <li key={`${selected?.id}-quote-${index}`}>"{quote}"</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {packageHistory.length > 0 && (
                      <details className="mt-4 rounded-xl border border-gray-800 bg-black/30 p-3">
                        <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-gray-500">
                          Version History ({packageHistory.length})
                        </summary>
                        <div className="mt-2 space-y-2">
                          {packageHistory.slice(0, 8).map(item => (
                            <div key={item.id} className="flex items-center justify-between text-[11px] text-gray-500 border border-gray-800 rounded-lg px-3 py-2">
                              <span>v{item.version} - {item.status}</span>
                              <span>{new Date(item.updatedAt).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-6">
                  {selected.tags.slice(0, 6).map(tag => (
                    <span key={tag} className="px-3 py-1 bg-gray-800 text-[#D0FF59] rounded-full text-xs">#{tag}</span>
                  ))}
                </div>

                <div className="mt-8">
                  <div className="overflow-x-auto pb-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <div className="flex items-stretch gap-4 min-w-max">
                      {selected.beats.map((beat, index) => {
                        const connector = selected.beats[index + 1]?.connection;
                        return (
                          <div key={beat.id} className="flex items-center">
                            <BeatCard beat={beat} onOpen={() => setExpandedAnecdote(beat.anecdote)} />
                            {connector && (
                              <div className="flex flex-col items-center gap-2 px-4">
                                <div className="w-16 h-0.5 bg-gradient-to-r from-[#D0FF59] to-transparent" />
                                <span className="text-[10px] uppercase tracking-wider text-gray-500">
                                  {connector.type === 'tag' ? connector.label : connector.type}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Click any beat to open the full anecdote.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-8">
                  <div className="bg-black/50 border border-gray-800 rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Opening Line</p>
                    <p className="text-gray-200 text-sm leading-relaxed">{selected.openingLine}</p>
                  </div>
                  <div className="bg-black/50 border border-gray-800 rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Closing Line</p>
                    <p className="text-gray-200 text-sm leading-relaxed">{selected.closingLine}</p>
                  </div>
                </div>

                <div className="mt-6 bg-black/40 border border-gray-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500 mb-4">
                    <Film className="w-4 h-4" />
                    Script Beats
                  </div>
                  <div className="space-y-3">
                    {selected.beats.map((beat, index) => (
                      <div key={`${beat.id}-line`} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-800 text-[#D0FF59] text-xs font-semibold flex items-center justify-center">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-200 leading-relaxed">{beat.voiceover}</p>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
                            <span className="flex items-center gap-1"><User className="w-3 h-3" />{beat.anecdote.storyteller}</span>
                            {beat.anecdote.location && (
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{beat.anecdote.location}</span>
                            )}
                            {beat.anecdote.tags.length > 0 && (
                              <span className="flex items-center gap-1"><Tag className="w-3 h-3" />#{beat.anecdote.tags[0]}</span>
                            )}
                          </div>
                          {(showDebug || canViewStorylineInsights) && beat.debug && (
                            <details className="mt-2 rounded-lg border border-gray-800 bg-black/35 p-2">
                              <summary className="cursor-pointer list-none text-[11px] text-gray-400 flex items-center gap-1">
                                <Bug className="w-3 h-3" />
                                Score breakdown ({beat.debug.total.toFixed(2)})
                              </summary>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-500">
                                <span>shared tags</span><span className="text-right">+{beat.debug.sharedTagScore.toFixed(2)}</span>
                                <span>storyteller</span><span className="text-right">+{beat.debug.storytellerScore.toFixed(2)}</span>
                                <span>location</span><span className="text-right">+{beat.debug.locationScore.toFixed(2)}</span>
                                <span>chronology</span><span className="text-right">+{beat.debug.chronologyScore.toFixed(2)}</span>
                                <span>recency</span><span className="text-right">+{beat.debug.recencyScore.toFixed(2)}</span>
                                <span>theme</span><span className="text-right">+{beat.debug.themeScore.toFixed(2)}</span>
                                <span>usage penalty</span><span className="text-right">-{beat.debug.usagePenalty.toFixed(2)}</span>
                                <span>mode penalty</span><span className="text-right">-{beat.debug.modePenalty.toFixed(2)}</span>
                              </div>
                              {beat.debug.sharedTags.length > 0 && (
                                <p className="text-[10px] text-gray-600 mt-1">tags: {beat.debug.sharedTags.map(tag => `#${tag}`).join(' ')}</p>
                              )}
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {(canViewStorylineInsights || showDebug) && (
                  <details
                    className="mt-4 border border-gray-800 rounded-xl bg-black/30 p-4 text-gray-500"
                    style={{ fontFamily: "'Courier New', Courier, monospace" }}
                  >
                    <summary className="cursor-pointer text-xs tracking-wide text-gray-400">
                      Insights: How this beat sheet and storyboard were built
                    </summary>
                    <p className="mt-3 text-xs leading-relaxed">
                      We score each anecdote transition using shared tags, timeline flow, storyteller and location continuity,
                      and impact signals. The beat sheet is then assembled from the highest-scoring chain, while avoiding
                      overusing the same anecdotes. The storyboard view mirrors that ordered chain so each card reflects
                      why the next moment follows from the previous one.
                    </p>
                  </details>
                )}

              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BeatCard({ beat, onOpen }: { beat: StorylineBeat; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="relative w-56 text-left bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-4 hover:border-[#D0FF59]/50 transition-colors"
    >
      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
        <span>{new Date(beat.anecdote.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span className="text-[#D0FF59]">{beat.anecdote.year}</span>
      </div>
      <h4 className="text-white text-sm font-semibold mb-2 line-clamp-2">{beat.anecdote.title}</h4>
      <p className="text-gray-400 text-xs line-clamp-3">{beat.summary}</p>
      <div className="flex items-center gap-1 mt-4">
        {Array.from({ length: 5 }).map((_, idx) => (
          <span
            key={`${beat.id}-intensity-${idx}`}
            className={`h-1.5 flex-1 rounded-full ${idx < beat.intensity ? 'bg-[#D0FF59]' : 'bg-gray-700'}`}
          />
        ))}
      </div>
    </button>
  );
}
