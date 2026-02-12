import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Clapperboard, Sparkles, Film, ArrowRight, Tag, User, MapPin, Clock, Flame, Bug } from 'lucide-react';
import { useTimeline } from '@/context/TimelineContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { generateStorylines } from '@/lib/storylineGenerator';
import type { Storyline, StorylineBeat, StorylineStyle } from '@/types';

const STYLE_META: Record<StorylineStyle, { label: string; badge: string; glow: string; icon: ReactElement }> = {
  '50cent': {
    label: '50 Cent Cut',
    badge: 'bg-amber-300 text-black',
    glow: 'from-amber-400/25 via-transparent to-transparent',
    icon: <Sparkles className="w-4 h-4" />,
  },
  jesse: {
    label: 'Jesse Washington Cut',
    badge: 'bg-sky-300 text-black',
    glow: 'from-sky-400/25 via-transparent to-transparent',
    icon: <Film className="w-4 h-4" />,
  },
  coogler: {
    label: 'Ryan Coogler Cut',
    badge: 'bg-rose-300 text-black',
    glow: 'from-rose-400/30 via-transparent to-transparent',
    icon: <Flame className="w-4 h-4" />,
  },
  hybrid: {
    label: 'Hybrid Cut',
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
  const lastSavedSignature = useRef<string | null>(null);
  const showDebug = import.meta.env.DEV || import.meta.env.VITE_STORYLINE_DEBUG === 'true';

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

  const handleSave = async () => {
    if (!storylines.length) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const result = await api.saveStorylines(storylines);
      setSaveMessage(`Saved ${result.count} storyline${result.count === 1 ? '' : 's'} to storylines.json`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save storylines');
    } finally {
      setIsSaving(false);
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
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-200 hover:border-[#D0FF59] hover:text-[#D0FF59] transition-colors disabled:opacity-60"
                      >
                        {isSaving ? 'Saving...' : 'Save storylines'}
                      </button>
                    )}
                    {saveMessage && (
                      <span className="text-[11px] text-gray-500">{saveMessage}</span>
                    )}
                  </div>
                </div>

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
                          {showDebug && beat.debug && (
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
