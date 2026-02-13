import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-4.1-mini';
const SUPPORTS_TEMPERATURE = !OPENAI_MODEL.startsWith('gpt-5');

const STORY_PACKAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['writeup', 'storyboard', 'extras'],
  properties: {
    writeup: {
      type: 'object',
      additionalProperties: false,
      required: ['headline', 'deck', 'narrative'],
      properties: {
        headline: { type: 'string' },
        deck: { type: 'string' },
        narrative: { type: 'string' },
      },
    },
    storyboard: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sceneNumber', 'beatId', 'slugline', 'imagePrompt', 'visualDirection', 'camera', 'audio', 'voiceover', 'onScreenText', 'transition', 'durationSeconds'],
        properties: {
          sceneNumber: { type: 'number' },
          beatId: { type: 'string' },
          slugline: { type: 'string' },
          imagePrompt: { type: 'string' },
          visualDirection: { type: 'string' },
          camera: { type: 'string' },
          audio: { type: 'string' },
          voiceover: { type: 'string' },
          onScreenText: { type: 'string' },
          transition: { type: 'string' },
          durationSeconds: { type: 'number' },
        },
      },
    },
    extras: {
      type: 'object',
      additionalProperties: false,
      required: ['logline', 'socialCaption', 'pullQuotes'],
      properties: {
        logline: { type: 'string' },
        socialCaption: { type: 'string' },
        pullQuotes: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

const STORYBOARD_SCENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sceneNumber', 'beatId', 'slugline', 'imagePrompt', 'visualDirection', 'camera', 'audio', 'voiceover', 'onScreenText', 'transition', 'durationSeconds'],
  properties: {
    sceneNumber: { type: 'number' },
    beatId: { type: 'string' },
    slugline: { type: 'string' },
    imagePrompt: { type: 'string' },
    visualDirection: { type: 'string' },
    camera: { type: 'string' },
    audio: { type: 'string' },
    voiceover: { type: 'string' },
    onScreenText: { type: 'string' },
    transition: { type: 'string' },
    durationSeconds: { type: 'number' },
  },
} as const;

const POLISHED_SYNOPSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'logline', 'synopsis'],
  properties: {
    title: { type: 'string' },
    logline: { type: 'string' },
    synopsis: { type: 'string' },
  },
} as const;

const POLISHED_BEATS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['beats'],
  properties: {
    beats: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['minuteStart', 'minuteEnd', 'pseudoBeat', 'polishedBeat', 'objective', 'conflict', 'turn', 'intensity', 'tags'],
        properties: {
          minuteStart: { type: 'number' },
          minuteEnd: { type: 'number' },
          pseudoBeat: { type: 'string' },
          polishedBeat: { type: 'string' },
          objective: { type: 'string' },
          conflict: { type: 'string' },
          turn: { type: 'string' },
          intensity: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const PROJECT_STORYBOARD_SCHEMA = STORY_PACKAGE_SCHEMA;

const parseJsonFromText = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
};

type CreateResponseFn = (args: any) => Promise<any>;

const extractOutputText = (response: any): string => {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (Array.isArray(response?.output)) {
    return response.output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .filter((content: any) => content?.type === 'output_text' || content?.type === 'text')
      .map((content: any) => content?.text || '')
      .join('\n')
      .trim();
  }

  return '';
};

const callLlmForJson = async (
  args: {
    systemInstruction: string;
    payload: any;
    temperature: number;
    responseSchema: any;
  },
  createResponse: CreateResponseFn
) => {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await createResponse({
    model: OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: args.systemInstruction,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify(args.payload),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'storyline_payload',
        schema: args.responseSchema,
        strict: true,
      },
    },
    ...(SUPPORTS_TEMPERATURE ? { temperature: args.temperature } : {}),
  });

  const parsed = parseJsonFromText(extractOutputText(response));
  if (!parsed) throw new Error('OpenAI returned invalid JSON');
  return parsed;
};

const createOpenAIClient = () => new OpenAI({ apiKey: OPENAI_API_KEY });

export const generateStoryboardFrameWithLlm = async (prompt: string) => {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  const client = createOpenAIClient();
  const response = await client.responses.create({
    model: OPENAI_IMAGE_MODEL,
    input: prompt,
    tools: [{ type: 'image_generation' }],
  });

  const imageData = Array.isArray((response as any)?.output)
    ? (response as any).output
      .filter((output: any) => output?.type === 'image_generation_call')
      .map((output: any) => output?.result)
      .find((result: any) => typeof result === 'string' && result.length > 0)
    : null;

  if (!imageData) {
    throw new Error('OpenAI image generation returned no image data');
  }

  return imageData as string;
};

export const generateStoryPackageWithLlm = async (storylineContext: any, prompt: string) => {
  const client = createOpenAIClient();
  return callLlmForJson({
    systemInstruction: 'You are a documentary writer and storyboard artist. Use only facts from context. Do not invent missing facts; use UNKNOWN. Keep chronology aligned with beat order. Return only JSON with shape: { writeup: { headline, deck, narrative }, storyboard: Scene[], extras: { logline, socialCaption, pullQuotes[] } }. Each storyboard scene must include: sceneNumber, beatId, slugline, imagePrompt, visualDirection, camera, audio, voiceover, onScreenText, transition, durationSeconds. imagePrompt should be a concise cinematic concept-art prompt for one frame of the scene.',
    payload: {
      prompt: prompt || 'Create a compelling documentary write-up and production-ready storyboard.',
      storyline: storylineContext,
    },
    temperature: 0.7,
    responseSchema: STORY_PACKAGE_SCHEMA,
  }, client.responses.create.bind(client.responses));
};

export const regenerateStoryboardSceneWithLlm = async (storylineContext: any, scene: any, prompt: string) => {
  const client = createOpenAIClient();
  return callLlmForJson({
    systemInstruction: 'You are a documentary storyboard editor. Rewrite one scene only. Keep facts grounded in the supplied storyline/anecdote context. Keep sceneNumber and beatId aligned with the provided scene. Return only JSON with fields: sceneNumber, beatId, slugline, imagePrompt, visualDirection, camera, audio, voiceover, onScreenText, transition, durationSeconds.',
    payload: {
      prompt: prompt || 'Regenerate this scene with stronger cinematic detail while staying factual.',
      storyline: storylineContext,
      scene,
    },
    temperature: 0.65,
    responseSchema: STORYBOARD_SCENE_SCHEMA,
  }, client.responses.create.bind(client.responses));
};

export const refineSynopsisWithLlm = async (args: { pseudoSynopsis: string; style?: string; durationMinutes?: number; styleBible?: any }) => {
  const client = createOpenAIClient();
  return callLlmForJson({
    systemInstruction: 'You are an award-winning film development editor. Rewrite rough synopsis text into polished cinematic synopsis. Keep intent and core plot. Return only JSON with keys: title, logline, synopsis.',
    payload: {
      style: args.style || 'cinematic',
      durationMinutes: Number(args.durationMinutes || 10),
      styleBible: args.styleBible || null,
      pseudoSynopsis: args.pseudoSynopsis,
    },
    temperature: 0.7,
    responseSchema: POLISHED_SYNOPSIS_SCHEMA,
  }, client.responses.create.bind(client.responses));
};

export const polishNotesIntoBeatsWithLlm = async (args: { synopsis: string; notes: any[]; durationMinutes?: number; style?: string; styleBible?: any }) => {
  const client = createOpenAIClient();
  return callLlmForJson({
    systemInstruction: 'You are a film story editor. Convert rough story notes into coherent minute-by-minute beats. Keep chronology logical and escalating. Return only JSON with shape: { beats: [{ minuteStart, minuteEnd, pseudoBeat, polishedBeat, objective, conflict, turn, intensity, tags[] }] }.',
    payload: {
      style: args.style || 'cinematic',
      styleBible: args.styleBible || null,
      durationMinutes: Number(args.durationMinutes || 10),
      synopsis: args.synopsis,
      notes: args.notes,
    },
    temperature: 0.65,
    responseSchema: POLISHED_BEATS_SCHEMA,
  }, client.responses.create.bind(client.responses));
};

export const generateProjectStoryboardWithLlm = async (args: { title: string; synopsis: string; beats: any[]; prompt?: string; style?: string; styleBible?: any }) => {
  const client = createOpenAIClient();
  return callLlmForJson({
    systemInstruction: 'You are a film director and storyboard artist. Generate a coherent cinematic storyboard from polished beats. Respect beat order and pacing. Return only JSON with shape { writeup, storyboard, extras } and each storyboard item must include beatId and imagePrompt. imagePrompt should be a concise visual generation prompt for a single storyboard frame.',
    payload: {
      title: args.title,
      style: args.style || 'cinematic',
      styleBible: args.styleBible || null,
      prompt: args.prompt || 'Generate a cinematic storyboard package.',
      synopsis: args.synopsis,
      beats: args.beats,
    },
    temperature: 0.7,
    responseSchema: PROJECT_STORYBOARD_SCHEMA,
  }, client.responses.create.bind(client.responses));
};

export const __test = {
  callLlmForJson,
  parseJsonFromText,
  extractOutputText,
};
