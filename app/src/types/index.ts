export interface Media {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  caption?: string;
}

export interface Anecdote {
  id: string;
  date: string;
  year: number;
  title: string;
  story: string;
  storyteller: string;
  location: string;
  notes: string;
  media: Media[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TimelineYear {
  year: number;
  anecdotes: Anecdote[];
}

export interface StoryNode {
  id: string;
  anecdote: Anecdote;
  x: number;
  y: number;
}

export interface StoryLink {
  source: string;
  target: string;
  type: 'date' | 'storyteller' | 'tag';
}

export type StorylineStyle = 'chronicle' | 'nightlife' | 'breakthrough' | 'cinematic';

export interface StorylineConnection {
  type: 'tag' | 'storyteller' | 'location' | 'chronology';
  label: string;
}

export interface StorylineBeat {
  id: string;
  anecdote: Anecdote;
  summary: string;
  voiceover: string;
  connection: StorylineConnection | null;
  intensity: number;
  debug?: StorylineScoreBreakdown | null;
}

export interface StorylineScoreBreakdown {
  total: number;
  sharedTagScore: number;
  storytellerScore: number;
  locationScore: number;
  chronologyScore: number;
  recencyScore: number;
  themeScore: number;
  usagePenalty: number;
  modePenalty: number;
  storytellerStreak: number;
  sharedTags: string[];
  previousAnecdoteId: string;
  candidateAnecdoteId: string;
}

export interface Storyline {
  id: string;
  title: string;
  description: string;
  style: StorylineStyle;
  tone: string;
  openingLine: string;
  closingLine: string;
  beats: StorylineBeat[];
  tags: string[];
  timeframe: {
    start: string;
    end: string;
    years: number[];
  };
}
