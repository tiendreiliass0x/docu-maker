import { describe, expect, test } from 'bun:test';

describe('storyline llm adapter', () => {
  test('parses JSON text from OpenAI response output_text', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { __test } = await import('./storylineLlm');

    const mockCreateResponse = async () => ({
      output_text: '{"ok":true,"source":"openai"}',
    });

    const result = await __test.callLlmForJson({
      systemInstruction: 'test',
      payload: { x: 1 },
      temperature: 0,
      responseSchema: { type: 'object' },
    }, mockCreateResponse as any);

    expect(result).toEqual({ ok: true, source: 'openai' });
  });

  test('parses fenced JSON fallback', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { __test } = await import('./storylineLlm');

    const mockCreateResponse = async () => ({
      output: [
        {
          content: [{ type: 'output_text', text: '```json\n{"ok":true,"source":"fenced"}\n```' }],
        },
      ],
    });

    const result = await __test.callLlmForJson({
      systemInstruction: 'test',
      payload: { x: 1 },
      temperature: 0,
      responseSchema: { type: 'object' },
    }, mockCreateResponse as any);

    expect(result).toEqual({ ok: true, source: 'fenced' });
  });
});
