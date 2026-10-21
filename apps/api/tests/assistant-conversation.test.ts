import { describe, expect, it, vi } from 'vitest';
import { AskAssistant } from '../src/modules/assistant/application/ask-assistant.js';
import { GuidedInterpreter } from '../src/modules/assistant/infrastructure/guided-interpreter.js';
import { GeminiInterpreter } from '../src/modules/assistant/infrastructure/gemini-interpreter.js';
import { OpenAIInterpreter } from '../src/modules/assistant/infrastructure/openai-interpreter.js';
import type {
  AssistantConversationInput,
  AssistantPlan,
  AssistantTurnInput,
} from '../src/modules/assistant/domain/assistant.js';

const scope = '111111111111111111111111';
const plan: AssistantPlan = {
  intent: 'chat',
  topic: 'navigation',
  status: 'open',
  query: '',
};
const guided = new GuidedInterpreter();

describe('Gemini single-request conversation', () => {
  const input: AssistantTurnInput = {
    question: 'How do I make pasta?',
    previousQuestions: [],
    conversation: [],
    firstName: 'Test',
    locale: 'en',
  };
  function envelope(turn: unknown) {
    return {
      status: 'completed',
      steps: [
        {
          type: 'model_output',
          content: [{ type: 'text', text: JSON.stringify(turn) }],
        },
      ],
    };
  }
  it.each([
    { plan, message: 'Boil the pasta following the timing on its packet.' },
    { plan: { ...plan, intent: 'projects' }, message: null },
  ])(
    'routes and replies using one bounded, stateless request',
    async (turn) => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(envelope(turn)),
      );
      const interpreter = new GeminiInterpreter(
        'private-test-key',
        'gemini-3.5-flash-lite',
        transport,
      );
      expect(await interpreter.reply(input)).toEqual(turn);
      expect(transport).toHaveBeenCalledTimes(1);
      const [url, init] = transport.mock.calls[0]!;
      const body = JSON.parse(String(init?.body));
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
      );
      expect(JSON.parse(body.input)).toEqual(input);
      expect(body.store).toBe(false);
      expect(body.generation_config.max_output_tokens).toBe(1200);
      expect(body.response_format.schema.required).toEqual(['plan', 'message']);
      expect(body.tools).toBeUndefined();
      expect(String(init?.body)).not.toContain('private-test-key');
    },
  );
  it.each([
    { plan, message: null },
    { plan, message: '' },
    { plan, message: 'x'.repeat(4001) },
    { plan, message: 'hello', records: [] },
    { plan: { ...plan, intent: 'projects' }, message: 'A made-up project.' },
    { plan: { ...plan, intent: 'unsupported' }, message: 'hello' },
  ])(
    'rejects malformed or fabricated combined output without a retry',
    async (turn) => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(envelope(turn)),
      );
      await expect(
        new GeminiInterpreter(
          'private-test-key',
          'configured-model',
          transport,
        ).reply(input),
      ).rejects.toThrow('Invalid assistant turn');
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
});

function setup(intent: AssistantPlan['intent'] = 'chat') {
  const reads = {
    overview: vi.fn(),
    projects: vi.fn(async () => ({ records: [], hasMore: false })),
    receivables: vi.fn(),
    search: vi.fn(),
  };
  const model = {
    provider: 'gemini' as const,
    interpret: vi.fn(async () => ({ ...plan, intent })),
    respond: vi.fn(async () => 'أهلًا يا عمر! إزيك؟'),
  };
  return { reads, model, service: new AskAssistant(reads, guided, model) };
}
describe('Natural conversation and trusted reads', () => {
  it('classifies and answers a general question in a single provider call without workspace reads', async () => {
    const { reads, model } = setup();
    const reply = vi.fn(async () => ({
      plan,
      message: 'ابدأ بالمهمة الأهم، وبعدها خد استراحة قصيرة.',
    }));
    const service = new AskAssistant(reads, guided, { ...model, reply });
    const result = await service.execute(
      scope,
      { message: 'أرتب يومي إزاي؟', history: ['إزيك'], locale: 'ar' },
      undefined,
      { displayName: 'عمر محمد' },
    );
    expect(result).toMatchObject({
      engine: 'gemini',
      degraded: false,
      message: 'ابدأ بالمهمة الأهم، وبعدها خد استراحة قصيرة.',
    });
    expect(reply).toHaveBeenCalledExactlyOnceWith(
      {
        question: 'أرتب يومي إزاي؟',
        previousQuestions: ['إزيك'],
        conversation: [],
        firstName: 'عمر',
        locale: 'ar',
      },
      undefined,
    );
    expect(model.interpret).not.toHaveBeenCalled();
    expect(model.respond).not.toHaveBeenCalled();
    for (const read of Object.values(reads))
      expect(read).not.toHaveBeenCalled();
  });
  it.each([
    ['ازاي أعمل مكرونة؟', 'ar'],
    ['اعمل ملخص عن تاريخ الأهرامات', 'ar'],
    ['عايز أفكار لمشروع تخرج', 'ar'],
    ['How do I make pasta?', 'en'],
    ['Summarize the history of the pyramids', 'en'],
  ] as const)(
    'explains a quota failure for %s without unrelated product instructions or data reads',
    async (message, locale) => {
      const { reads, model } = setup();
      const reply = vi.fn(async () => {
        throw { status: 429 };
      });
      const result = await new AskAssistant(reads, guided, {
        ...model,
        reply,
      }).execute(scope, { message, locale, history: [] });
      expect(result).toMatchObject({
        engine: 'guided',
        degraded: true,
        plan: { intent: 'clarify' },
        records: [],
        facts: null,
      });
      expect(result.message).toContain(
        locale === 'ar' ? 'حدّ طلبات' : 'request limit',
      );
      expect(reply).toHaveBeenCalledTimes(1);
      expect(model.interpret).not.toHaveBeenCalled();
      expect(model.respond).not.toHaveBeenCalled();
      for (const read of Object.values(reads))
        expect(read).not.toHaveBeenCalled();
    },
  );
  it('does not display model-invented records or retry a malformed combined turn', async () => {
    const { reads, model } = setup();
    const reply = vi.fn(async () => ({
      plan: { ...plan, intent: 'projects' as const },
      message: 'Your project is finished and paid.',
    }));
    const result = await new AskAssistant(reads, guided, {
      ...model,
      reply,
    }).execute(scope, { message: 'my open projects', history: [] });
    expect(result).toMatchObject({
      message: null,
      degraded: true,
      records: [],
    });
    expect(reads.projects).toHaveBeenCalledExactlyOnceWith(scope, 'open');
    expect(reply).toHaveBeenCalledTimes(1);
    expect(model.interpret).not.toHaveBeenCalled();
  });
  it('does not fall back or read records after a combined request is cancelled', async () => {
    const { reads, model } = setup();
    const controller = new AbortController();
    const reply = vi.fn(async () => {
      controller.abort();
      throw new Error('cancelled');
    });
    await expect(
      new AskAssistant(reads, guided, { ...model, reply }).execute(
        scope,
        { message: 'open projects', history: [] },
        controller.signal,
      ),
    ).rejects.toThrow('cancelled');
    for (const read of Object.values(reads))
      expect(read).not.toHaveBeenCalled();
  });
  it('generates an arbitrary follow-up with bounded context and only the authenticated first name', async () => {
    const { reads, model, service } = setup();
    const conversation = [
      { question: 'ساعدني أنظم يومي', answer: 'ابدأ بمهمتين أساسيتين.' },
    ];
    const result = await service.execute(
      scope,
      {
        message: 'ولو معايا ساعتين بس؟',
        history: ['ساعدني أنظم يومي'],
        conversation,
        locale: 'ar',
      },
      undefined,
      { displayName: 'عمر محمد' },
    );
    expect(result).toMatchObject({
      message: 'أهلًا يا عمر! إزيك؟',
      engine: 'gemini',
      degraded: false,
      records: [],
      facts: null,
    });
    expect(model.respond).toHaveBeenCalledExactlyOnceWith(
      {
        question: 'ولو معايا ساعتين بس؟',
        previousQuestions: ['ساعدني أنظم يومي'],
        conversation,
        firstName: 'عمر',
        locale: 'ar',
        plan,
      },
      undefined,
    );
    for (const read of Object.values(reads))
      expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify(model.respond.mock.calls)).not.toContain(scope);
    expect(JSON.stringify(model.respond.mock.calls)).not.toContain('عمر محمد');
  });
  it.each(['help', 'clarify'] as const)(
    'can explain %s naturally without reading records',
    async (intent) => {
      const { model, service, reads } = setup(intent);
      await service.execute(scope, {
        message: 'What can you help me with?',
        history: [],
      });
      expect(model.respond).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: '', locale: 'en' }),
        undefined,
      );
      for (const read of Object.values(reads))
        expect(read).not.toHaveBeenCalled();
    },
  );
  it('never sends read results or balances to the response model', async () => {
    const { model, service, reads } = setup('projects');
    const result = await service.execute(scope, {
      message: 'open projects',
      history: [],
    });
    expect(reads.projects).toHaveBeenCalledExactlyOnceWith(scope, 'open');
    expect(model.respond).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      message: null,
      engine: 'gemini',
      degraded: false,
    });
  });
  it.each(['', 'x'.repeat(4001), 'bad\u0000text'])(
    'falls back visibly for invalid generated prose',
    async (invalid) => {
      const { model, service } = setup();
      model.respond.mockResolvedValue(invalid);
      expect(
        await service.execute(scope, {
          message: 'help me brainstorm',
          history: [],
        }),
      ).toMatchObject({
        message: expect.stringContaining('cannot reach'),
        engine: 'guided',
        degraded: true,
      });
    },
  );
  it('preserves reviewed help on provider failure and never misrepresents cancellation as an answer', async () => {
    const { model, service } = setup('help');
    model.respond.mockRejectedValueOnce(new Error('private provider failure'));
    expect(
      await service.execute(scope, {
        message: 'What is Lancelio?',
        history: [],
      }),
    ).toMatchObject({
      message: null,
      engine: 'guided',
      degraded: true,
      plan: { intent: 'help' },
    });
    const controller = new AbortController();
    model.respond.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('Cancelled');
    });
    await expect(
      service.execute(scope, { message: 'hi', history: [] }, controller.signal),
    ).rejects.toThrow('Cancelled');
  });
  it('skips generation when interpretation failed, with personalized guided greetings', async () => {
    const { model, service } = setup();
    model.interpret.mockRejectedValueOnce(new Error('offline'));
    const result = await service.execute(
      scope,
      { message: 'hello', history: [], locale: 'en' },
      undefined,
      { displayName: 'Mona Ali' },
    );
    expect(result).toMatchObject({
      engine: 'guided',
      degraded: true,
      message: expect.stringContaining('Hi, Mona!'),
    });
    expect(model.respond).not.toHaveBeenCalled();
    expect(
      await new AskAssistant(setup().reads, guided).execute(
        scope,
        { message: 'ازيك', history: [] },
        undefined,
        { displayName: 'عمر محمد' },
      ),
    ).toMatchObject({
      message: expect.stringContaining('يا عمر'),
      plan: { intent: 'chat' },
    });
  });
  it.each([
    {
      conversation: Array.from({ length: 7 }, () => ({
        question: 'hi',
        answer: 'hello',
      })),
    },
    { conversation: [{ question: 'hi', answer: 'x'.repeat(2001) }] },
    { conversation: [{ question: '', answer: 'hello' }] },
    { conversation: [{ question: 'hi', answer: 'bad\u0000text' }] },
    { locale: 'fr' as 'en' },
  ])(
    'rejects excessive or malformed context before any provider call',
    async (extra) => {
      const { model, service } = setup();
      await expect(
        service.execute(scope, { message: 'hi', history: [], ...extra }),
      ).rejects.toThrow('Invalid assistant question');
      expect(model.interpret).not.toHaveBeenCalled();
    },
  );
});

describe.each(['gemini', 'openai'] as const)(
  '%s conversation transport',
  (provider) => {
    const input: AssistantConversationInput = {
      question: 'طب أبدأ بإيه؟',
      previousQuestions: ['خطط يومي'],
      conversation: [{ question: 'خطط يومي', answer: 'ابدأ بأهم مهمتين.' }],
      firstName: 'عمر',
      locale: 'ar',
      plan,
    };
    function envelope(reply: unknown) {
      const text = JSON.stringify(reply);
      return provider === 'gemini'
        ? {
            status: 'completed',
            steps: [
              { type: 'model_output', content: [{ type: 'text', text }] },
            ],
          }
        : {
            status: 'completed',
            output: [
              { type: 'message', content: [{ type: 'output_text', text }] },
            ],
          };
    }
    const create = (transport: typeof fetch) =>
      provider === 'gemini'
        ? new GeminiInterpreter(
            'private-test-key',
            'configured-model',
            transport,
          )
        : new OpenAIInterpreter(
            'private-test-key',
            'configured-model',
            transport,
          );
    it('generates structured plain text with ephemeral context, a fixed endpoint and no tools or session IDs', async () => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(
          envelope({ message: 'ابدأ بالمهمة الأقرب لموعد التسليم.' }),
        ),
      );
      expect(await create(transport).respond(input)).toBe(
        'ابدأ بالمهمة الأقرب لموعد التسليم.',
      );
      const [url, init] = transport.mock.calls[0]!;
      expect(String(url)).toBe(
        provider === 'gemini'
          ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
          : 'https://api.openai.com/v1/responses',
      );
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.tools).toBeUndefined();
      expect(body.previous_response_id).toBeUndefined();
      expect(body.previous_interaction_id).toBeUndefined();
      expect(
        JSON.parse(provider === 'gemini' ? body.input : body.input[0].content),
      ).toEqual(input);
      expect(
        (provider === 'gemini' ? body.response_format : body.text.format)
          .schema,
      ).toMatchObject({ required: ['message'], additionalProperties: false });
      expect(String(init?.body)).not.toContain('private-test-key');
    });
    it.each([
      null,
      {},
      { message: '' },
      { message: 'x'.repeat(4001) },
      { message: 'bad\u0000text' },
    ])(
      'rejects invalid responses instead of displaying success',
      async (reply) => {
        await expect(
          create(async () => Response.json(envelope(reply))).respond(input),
        ).rejects.toThrow();
      },
    );
    it('honors cancellation and sanitizes errors during generation', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        create(async (_url, init) => {
          init?.signal?.throwIfAborted();
          return Response.json(envelope({ message: 'hi' }));
        }).respond(input, controller.signal),
      ).rejects.toThrow();
      await expect(
        create(
          async () => new Response('PRIVATE DETAILS', { status: 401 }),
        ).respond(input),
      ).rejects.toThrow('Assistant interpreter unavailable');
    });
  },
);
