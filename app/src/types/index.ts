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

export interface StoryboardScene {
  sceneNumber: number;
  beatId: string;
  slugline: string;
  imagePrompt?: string;
  imageUrl?: string;
  visualDirection: string;
  camera: string;
  audio: string;
  voiceover: string;
  onScreenText: string;
  transition: string;
  durationSeconds: number;
  locked?: boolean;
  editorNotes?: string;
  shotPlan?: Array<{
    shot: string;
    framing: string;
    movement: string;
    durationSeconds: number;
  }>;
}

export interface StorylinePackageMeta {
  sceneDiffs?: Array<{
    sceneNumber: number;
    beatId: string;
    fieldsChanged: string[];
    reason: 'manual-edit' | 'scene-regenerate';
    changedAt: number;
  }>;
}

export interface StorylineGenerationResult {
  writeup: {
    headline: string;
    deck: string;
    narrative: string;
  };
  storyboard: StoryboardScene[];
  extras: {
    logline: string;
    socialCaption: string;
    pullQuotes: string[];
  };
  meta?: StorylinePackageMeta;
}

export interface StorylinePackageRecord {
  id: string;
  storylineId: string;
  payload: StorylineGenerationResult;
  prompt: string;
  status: 'draft' | 'review' | 'approved';
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface MovieProject {
  id: string;
  title: string;
  pseudoSynopsis: string;
  polishedSynopsis: string;
  style: 'cinematic' | 'mainstream' | 'festival';
  durationMinutes: number;
  status: 'draft' | 'active' | 'locked';
  createdAt: number;
  updatedAt: number;
}

export interface StoryNote {
  id: string;
  projectId: string;
  source: 'typed' | 'audio';
  rawText: string;
  transcript: string;
  minuteMark: number | null;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectBeat {
  id: string;
  projectId: string;
  sourceNoteId: string | null;
  orderIndex: number;
  minuteStart: number;
  minuteEnd: number;
  pseudoBeat: string;
  polishedBeat: string;
  objective: string;
  conflict: string;
  turn: string;
  intensity: number;
  tags: string[];
  locked?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RefinedSynopsis {
  title: string;
  logline: string;
  synopsis: string;
}

export interface ProjectStyleBible {
  visualStyle: string;
  cameraGrammar: string;
  doList: string[];
  dontList: string[];
}

export interface ContinuityIssue {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  suggestion?: string;
  beatId?: string;
}
