import type { Anecdote, Storyline, StorylineBeat, StorylineConnection, StorylineStyle } from '@/types';

type AnecdoteMeta = Anecdote & {
  _timestamp: number;
  _text: string;
  _tags: string[];
};

type StorylineRecipe = {
  id: string;
  title: string;
  description: string;
  style: StorylineStyle;
  mode: 'chronological' | 'tag' | 'impact' | 'community';
  focusTags: string[];
  focusKeywords: string[];
};

const NIGHTLIFE_TAGS = ['dj', 'dance', 'club', 'night', 'party', 'show', 'venue', 'live'];
const NIGHTLIFE_KEYWORDS = ['dj', 'dance', 'club', 'night', 'party', 'show', 'stage', 'crowd', 'set', 'bass', 'dancefloor', 'venue', 'afterparty'];
const IMPACT_KEYWORDS = ['first', 'sold out', 'breakthrough', 'headline', 'festival', 'tour', 'radio', 'award', 'viral', 'mainstream', 'debut', 'record', 'packed', 'historic'];
const COMMUNITY_KEYWORDS = ['community', 'diaspora', 'collective', 'organizer', 'student', 'campus', 'family', 'roots', 'culture', 'heritage', 'immigrant', 'neighbors'];

const STYLE_TONE: Record<StorylineStyle, string> = {
  '50cent': 'Gritty, first-person energy with swagger',
  jesse: 'Measured, human-centered reporting with reflective edges (Jesse Washington cut)',
  coogler: 'Cinematic, character-driven with emotional build and hope',
  hybrid: 'Cinematic with journalistic edge',
};

const YEAR_MS = 1000 * 60 * 60 * 24 * 365;

const buildText = (a: Anecdote) => (
  `${a.title} ${a.story} ${a.notes} ${a.location} ${a.storyteller} ${a.tags.join(' ')}`
).toLowerCase();

const toMeta = (anecdotes: Anecdote[]): AnecdoteMeta[] => {
  return anecdotes.map(a => ({
    ...a,
    _timestamp: new Date(a.date).getTime(),
    _text: buildText(a),
    _tags: a.tags.map(tag => tag.toLowerCase()),
  }));
};

const countMatches = (text: string, keywords: string[]): number => {
  return keywords.reduce((count, keyword) => (text.includes(keyword) ? count + 1 : count), 0);
};

const countTagMatches = (tags: string[], focus: string[]): number => {
  if (!focus.length) return 0;
  const set = new Set(tags);
  return focus.reduce((count, tag) => (set.has(tag) ? count + 1 : count), 0);
};

const sharedTags = (a: AnecdoteMeta, b: AnecdoteMeta) => a._tags.filter(tag => b._tags.includes(tag));

const computeImpactScore = (a: AnecdoteMeta): number => {
  let score = 0;
  score += countMatches(a._text, IMPACT_KEYWORDS);
  if (a._tags.includes('milestone')) score += 2;
  if (a._tags.includes('concert')) score += 2;
  if (a._tags.includes('festival')) score += 2;
  if (a._text.includes('sold out')) score += 2;
  return score;
};

const computeThemeScore = (a: AnecdoteMeta, recipe: StorylineRecipe): number => {
  let score = 0;
  score += countTagMatches(a._tags, recipe.focusTags) * 3;
  score += countMatches(a._text, recipe.focusKeywords) * 2;
  if (recipe.mode === 'impact') score += computeImpactScore(a) * 1.5;
  return score;
};

const scoreConnection = (
  prev: AnecdoteMeta,
  candidate: AnecdoteMeta,
  recipe: StorylineRecipe,
  usage: Map<string, number>
): number => {
  let score = 0;
  const shared = sharedTags(prev, candidate);
  score += shared.length * 2.5;
  if (prev.storyteller === candidate.storyteller) score += 3.5;
  if (prev.location && prev.location === candidate.location) score += 2;

  const timeDiff = Math.abs(candidate._timestamp - prev._timestamp) / YEAR_MS;
  if (candidate._timestamp >= prev._timestamp) score += 2;
  if (timeDiff <= 1) score += 1.5;
  if (timeDiff <= 3) score += 0.5;

  score += computeThemeScore(candidate, recipe);

  const usedCount = usage.get(candidate.id) || 0;
  score -= usedCount * 1.25;

  if (recipe.mode === 'chronological' && candidate._timestamp < prev._timestamp) {
    score -= 4;
  }

  return score;
};

const pickStart = (items: AnecdoteMeta[], recipe: StorylineRecipe, usage: Map<string, number>) => {
  if (recipe.mode === 'chronological') {
    return items.slice().sort((a, b) => a._timestamp - b._timestamp)[0];
  }

  let best: AnecdoteMeta | null = null;
  let bestScore = -Infinity;
  items.forEach(item => {
    const baseScore = computeThemeScore(item, recipe) + computeImpactScore(item) * 0.5;
    const penalty = (usage.get(item.id) || 0) * 1.5;
    const score = baseScore - penalty;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });

  return best || items[0];
};

const buildChain = (
  items: AnecdoteMeta[],
  recipe: StorylineRecipe,
  targetLength: number,
  usage: Map<string, number>
): AnecdoteMeta[] => {
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => a._timestamp - b._timestamp);
  const used = new Set<string>();
  const chain: AnecdoteMeta[] = [];

  let current = pickStart(sorted, recipe, usage);
  if (!current) return [];

  chain.push(current);
  used.add(current.id);

  while (chain.length < targetLength && used.size < sorted.length) {
    let best: AnecdoteMeta | null = null;
    let bestScore = -Infinity;

    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      const score = scoreConnection(current, candidate, recipe, usage);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best || bestScore < 0) {
      const forward = sorted.find(item => !used.has(item.id) && item._timestamp >= current._timestamp);
      const fallback = forward || sorted.find(item => !used.has(item.id));
      if (!fallback) break;
      best = fallback;
    }

    chain.push(best);
    used.add(best.id);
    current = best;
  }

  return chain;
};

const truncate = (text: string, max: number) => {
  if (text.length <= max) return text;
  const trimmed = text.slice(0, max - 3);
  const lastSpace = trimmed.lastIndexOf(' ');
  return `${trimmed.slice(0, lastSpace > 40 ? lastSpace : trimmed.length)}...`;
};

const buildConnection = (prev: AnecdoteMeta, next: AnecdoteMeta): StorylineConnection => {
  const shared = sharedTags(prev, next);
  if (shared.length) {
    return { type: 'tag', label: `#${shared[0]}` };
  }
  if (prev.storyteller === next.storyteller) {
    return { type: 'storyteller', label: prev.storyteller };
  }
  if (prev.location && prev.location === next.location) {
    return { type: 'location', label: prev.location };
  }
  return { type: 'chronology', label: `${prev.year} to ${next.year}` };
};

const buildVoiceover = (style: StorylineStyle, beat: AnecdoteMeta, index: number, total: number): string => {
  const summary = truncate(beat.story, 120);
  const location = beat.location ? ` at ${beat.location}` : '';

  if (style === '50cent') {
    if (index === 0) return `Back in ${beat.year}${location}, it started with ${beat.title.toLowerCase()}.`;
    if (index === total - 1) return `By ${beat.year}, ${beat.title} was proof the city had changed.`;
    return `${beat.title}${location}. ${summary}`;
  }

  if (style === 'jesse') {
    if (index === 0) return `In ${beat.year}${location}, a quiet shift started to feel inevitable.`;
    if (index === total - 1) return `By ${beat.year}, the story is no longer about a moment but a movement.`;
    return `${beat.storyteller} remembers ${beat.title.toLowerCase()}. ${summary}`;
  }

  if (style === 'coogler') {
    if (index === 0) return `In ${beat.year}${location}, a spark caught—small, personal, and loud.`;
    if (index === total - 1) return `By ${beat.year}, the whole city could feel the change.`;
    return `${beat.title} carries the momentum. ${summary}`;
  }

  if (index === 0) return `Seattle didn't plan for this. ${beat.title} lit the fuse in ${beat.year}.`;
  if (index === total - 1) return `The story keeps evolving after ${beat.year}.`;
  return `${beat.title}. ${summary}`;
};

const buildOpeningLine = (style: StorylineStyle, first: AnecdoteMeta): string => {
  const location = first.location ? ` at ${first.location}` : '';
  if (style === '50cent') return `This is how the city started moving in ${first.year}${location}.`;
  if (style === 'jesse') return `A sound crossed oceans and settled into Seattle by ${first.year}.`;
  if (style === 'coogler') return `In ${first.year}${location}, a new rhythm found its people.`;
  return `In ${first.year}${location}, the timeline sparks.`;
};

const buildClosingLine = (style: StorylineStyle, last: AnecdoteMeta): string => {
  if (style === '50cent') return `Now the rhythm is part of the city's DNA.`;
  if (style === 'jesse') return `The movement keeps writing its next chapter.`;
  if (style === 'coogler') return `The story lands, but the music keeps moving.`;
  return `The beat keeps moving after ${last.year}.`;
};

const buildStoryline = (
  recipe: StorylineRecipe,
  chain: AnecdoteMeta[]
): Storyline => {
  const beats: StorylineBeat[] = chain.map((beat, index) => {
    const prev = index > 0 ? chain[index - 1] : null;
    const intensity = Math.min(5, Math.max(1, Math.round(1 + computeImpactScore(beat) / 2)));

    return {
      id: `${recipe.id}-${index + 1}`,
      anecdote: beat,
      summary: truncate(beat.story, 140),
      voiceover: buildVoiceover(recipe.style, beat, index, chain.length),
      connection: prev ? buildConnection(prev, beat) : null,
      intensity,
    };
  });

  const tags = Array.from(new Set(chain.flatMap(beat => beat.tags)));
  const years = Array.from(new Set(chain.map(beat => beat.year))).sort((a, b) => a - b);

  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    style: recipe.style,
    tone: STYLE_TONE[recipe.style],
    openingLine: buildOpeningLine(recipe.style, chain[0]),
    closingLine: buildClosingLine(recipe.style, chain[chain.length - 1]),
    beats,
    tags,
    timeframe: {
      start: chain[0].date,
      end: chain[chain.length - 1].date,
      years,
    },
  };
};

const getTopTags = (items: AnecdoteMeta[], limit: number) => {
  const counts: Record<string, number> = {};
  items.forEach(item => {
    item._tags.forEach(tag => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
};

export const generateStorylines = (anecdotes: Anecdote[]): Storyline[] => {
  if (!anecdotes.length) return [];

  const items = toMeta(anecdotes);
  const topTags = getTopTags(items, 6);

  const recipes: StorylineRecipe[] = [
    {
      id: 'chronicle',
      title: 'Origins to Spotlight',
      description: 'A straight-line rise from the first rooms to the biggest stages.',
      style: 'jesse',
      mode: 'chronological',
      focusTags: topTags,
      focusKeywords: [],
    },
    {
      id: 'nightlife',
      title: 'Nightlife Pulse',
      description: 'The late-night circuit that kept the rhythm alive.',
      style: '50cent',
      mode: 'tag',
      focusTags: Array.from(new Set([...NIGHTLIFE_TAGS, ...topTags])),
      focusKeywords: NIGHTLIFE_KEYWORDS,
    },
    {
      id: 'breakthrough',
      title: 'Breakthrough Moments',
      description: 'When the scene broke past its borders and stayed there.',
      style: 'hybrid',
      mode: 'impact',
      focusTags: topTags,
      focusKeywords: IMPACT_KEYWORDS,
    },
    {
      id: 'community',
      title: 'Community Roots',
      description: 'The people, spaces, and diaspora that nurtured the sound.',
      style: 'jesse',
      mode: 'community',
      focusTags: topTags,
      focusKeywords: COMMUNITY_KEYWORDS,
    },
    {
      id: 'cinematic',
      title: 'Heat & Hope',
      description: 'A cinematic rise shaped by grit, joy, and the people who held it together.',
      style: 'coogler',
      mode: 'impact',
      focusTags: topTags,
      focusKeywords: [...IMPACT_KEYWORDS, ...COMMUNITY_KEYWORDS],
    },
  ];

  const targetLength = Math.min(8, Math.max(4, Math.round(items.length * 0.45)));
  const usage = new Map<string, number>();
  const storylines: Storyline[] = [];
  const signatures = new Set<string>();

  recipes.forEach(recipe => {
    const chain = buildChain(items, recipe, targetLength, usage);
    if (chain.length < 3) return;
    const signature = chain.map(item => item.id).join('-');
    if (signatures.has(signature)) return;

    const storyline = buildStoryline(recipe, chain);
    storylines.push(storyline);
    signatures.add(signature);
    chain.forEach(item => usage.set(item.id, (usage.get(item.id) || 0) + 1));
  });

  if (!storylines.length && items.length) {
    const fallbackRecipe: StorylineRecipe = {
      id: 'core',
      title: 'The Core Story',
      description: 'A quick-cut run through the key memories so far.',
      style: 'hybrid',
      mode: 'chronological',
      focusTags: topTags,
      focusKeywords: [],
    };
    const chain = buildChain(items, fallbackRecipe, Math.min(6, items.length), usage);
    if (chain.length) storylines.push(buildStoryline(fallbackRecipe, chain));
  }

  return storylines;
};
