import type {
  Anecdote,
  Storyline,
  StorylineBeat,
  StorylineConnection,
  StorylineScoreBreakdown,
  StorylineStyle,
} from '@/types';

type AnecdoteMeta = Anecdote & {
  _timestamp: number;
  _text: string;
  _tags: string[];
};

type TagWeights = Map<string, number>;

type ThemeScore = {
  total: number;
  tagScore: number;
  keywordScore: number;
  impactScore: number;
};

type ChainBuildResult = {
  chain: AnecdoteMeta[];
  debugByBeat: Map<string, StorylineScoreBreakdown>;
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

const SCORE_WEIGHTS = {
  sharedTag: 2.4,
  storytellerBase: 3,
  storytellerMin: 0.8,
  storytellerDecay: 1.35,
  storytellerVarietyBonus: 1.2,
  location: 1.75,
  chronologicalForward: 2.4,
  timeWithinYear: 1.25,
  timeWithin3Years: 0.4,
  usagePenalty: 1.1,
  chronologicalBacktrackPenalty: 4.5,
  themeTagWeight: 2.9,
  themeKeywordWeight: 1.6,
  impactModeMultiplier: 1.2,
  startImpactBoost: 0.5,
  startUsagePenalty: 1.4,
} as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  return keywords.reduce((count, keyword) => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return count;

    if (normalized.includes(' ')) {
      return count + (text.includes(normalized) ? 1 : 0);
    }

    const matches = text.match(new RegExp(`\\b${escapeRegex(normalized)}\\b`, 'g'));
    return count + Math.min(3, matches?.length || 0);
  }, 0);
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

const computeTagWeights = (items: AnecdoteMeta[]): TagWeights => {
  const tagDocs = new Map<string, number>();
  const totalDocs = Math.max(1, items.length);

  items.forEach(item => {
    const uniqueTags = new Set(item._tags);
    uniqueTags.forEach(tag => {
      tagDocs.set(tag, (tagDocs.get(tag) || 0) + 1);
    });
  });

  const weights: TagWeights = new Map();
  tagDocs.forEach((docCount, tag) => {
    const idf = Math.log((totalDocs + 1) / (docCount + 1)) + 1;
    weights.set(tag, Number(idf.toFixed(3)));
  });

  return weights;
};

const computeThemeScore = (a: AnecdoteMeta, recipe: StorylineRecipe, tagWeights: TagWeights): ThemeScore => {
  let tagScore = 0;
  const themeTagMatches = countTagMatches(a._tags, recipe.focusTags);
  if (themeTagMatches) {
    const weightedTags = recipe.focusTags.reduce((sum, tag) => {
      if (!a._tags.includes(tag)) return sum;
      return sum + (tagWeights.get(tag) || 1);
    }, 0);
    tagScore += weightedTags * SCORE_WEIGHTS.themeTagWeight;
  }

  const keywordScore = countMatches(a._text, recipe.focusKeywords) * SCORE_WEIGHTS.themeKeywordWeight;
  const impactScore = recipe.mode === 'impact' ? computeImpactScore(a) * SCORE_WEIGHTS.impactModeMultiplier : 0;

  return {
    total: tagScore + keywordScore + impactScore,
    tagScore,
    keywordScore,
    impactScore,
  };
};

const scoreConnection = (
  prev: AnecdoteMeta,
  candidate: AnecdoteMeta,
  recipe: StorylineRecipe,
  usage: Map<string, number>,
  tagWeights: TagWeights,
  storytellerStreak: number
): StorylineScoreBreakdown => {
  const shared = sharedTags(prev, candidate);
  const sharedTagScore = shared.length * SCORE_WEIGHTS.sharedTag;

  let storytellerScore = 0;
  if (prev.storyteller === candidate.storyteller) {
    storytellerScore += Math.max(SCORE_WEIGHTS.storytellerMin, SCORE_WEIGHTS.storytellerBase - storytellerStreak * SCORE_WEIGHTS.storytellerDecay);
  } else if (storytellerStreak >= 2) {
    storytellerScore += SCORE_WEIGHTS.storytellerVarietyBonus;
  }

  const locationScore = prev.location && prev.location === candidate.location ? SCORE_WEIGHTS.location : 0;

  const timeDiff = Math.abs(candidate._timestamp - prev._timestamp) / YEAR_MS;
  const chronologyScore = candidate._timestamp >= prev._timestamp ? SCORE_WEIGHTS.chronologicalForward : 0;
  let recencyScore = 0;
  if (timeDiff <= 1) recencyScore += SCORE_WEIGHTS.timeWithinYear;
  if (timeDiff <= 3) recencyScore += SCORE_WEIGHTS.timeWithin3Years;

  const theme = computeThemeScore(candidate, recipe, tagWeights);

  const usedCount = usage.get(candidate.id) || 0;
  const usagePenalty = usedCount * SCORE_WEIGHTS.usagePenalty;

  let modePenalty = 0;
  if (recipe.mode === 'chronological' && candidate._timestamp < prev._timestamp) {
    modePenalty += SCORE_WEIGHTS.chronologicalBacktrackPenalty;
  }

  const total = sharedTagScore
    + storytellerScore
    + locationScore
    + chronologyScore
    + recencyScore
    + theme.total
    - usagePenalty
    - modePenalty;

  return {
    total,
    sharedTagScore,
    storytellerScore,
    locationScore,
    chronologyScore,
    recencyScore,
    themeScore: theme.total,
    usagePenalty,
    modePenalty,
    storytellerStreak,
    sharedTags: shared,
    previousAnecdoteId: prev.id,
    candidateAnecdoteId: candidate.id,
  };
};

const pickStart = (
  items: AnecdoteMeta[],
  recipe: StorylineRecipe,
  usage: Map<string, number>,
  tagWeights: TagWeights
) => {
  if (recipe.mode === 'chronological') {
    return items.slice().sort((a, b) => a._timestamp - b._timestamp)[0];
  }

  let best: AnecdoteMeta | null = null;
  let bestScore = -Infinity;
  items.forEach(item => {
    const baseScore = computeThemeScore(item, recipe, tagWeights).total + computeImpactScore(item) * SCORE_WEIGHTS.startImpactBoost;
    const penalty = (usage.get(item.id) || 0) * SCORE_WEIGHTS.startUsagePenalty;
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
  usage: Map<string, number>,
  tagWeights: TagWeights
): ChainBuildResult => {
  if (!items.length) return { chain: [], debugByBeat: new Map() };
  const sorted = items.slice().sort((a, b) => a._timestamp - b._timestamp);
  const used = new Set<string>();
  const chain: AnecdoteMeta[] = [];
  const debugByBeat = new Map<string, StorylineScoreBreakdown>();

  let current = pickStart(sorted, recipe, usage, tagWeights);
  if (!current) return { chain: [], debugByBeat };

  chain.push(current);
  used.add(current.id);

  while (chain.length < targetLength && used.size < sorted.length) {
    let best: AnecdoteMeta | null = null;
    let bestBreakdown: StorylineScoreBreakdown | null = null;
    let bestScore = -Infinity;
    const storytellerStreak = (() => {
      let streak = 0;
      for (let i = chain.length - 1; i >= 0; i--) {
        if (chain[i].storyteller !== current.storyteller) break;
        streak += 1;
      }
      return streak;
    })();

    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      const breakdown = scoreConnection(current, candidate, recipe, usage, tagWeights, storytellerStreak);
      if (breakdown.total > bestScore) {
        bestScore = breakdown.total;
        best = candidate;
        bestBreakdown = breakdown;
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
    if (bestBreakdown) debugByBeat.set(best.id, bestBreakdown);
    current = best;
  }

  return { chain, debugByBeat };
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
  chain: AnecdoteMeta[],
  debugByBeat: Map<string, StorylineScoreBreakdown>
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
      debug: prev ? debugByBeat.get(beat.id) || null : null,
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
  const tagWeights = computeTagWeights(items);

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
    const { chain, debugByBeat } = buildChain(items, recipe, targetLength, usage, tagWeights);
    if (chain.length < 3) return;
    const signature = chain.map(item => item.id).join('-');
    if (signatures.has(signature)) return;

    const storyline = buildStoryline(recipe, chain, debugByBeat);
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
    const { chain, debugByBeat } = buildChain(items, fallbackRecipe, Math.min(6, items.length), usage, tagWeights);
    if (chain.length) storylines.push(buildStoryline(fallbackRecipe, chain, debugByBeat));
  }

  return storylines;
};
